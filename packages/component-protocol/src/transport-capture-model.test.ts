import { ChildProcess, spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { PassThrough, type Readable } from "node:stream";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { expect, type TestContext, test } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { createProtocolPeer, type EvidenceRecord } from "./create-protocol-peer.ts";
import { createSeededGenerator } from "./create-seeded-generator.ts";
import {
  referenceBinding,
  referenceContracts,
  referenceIdentity,
  referenceManifest,
  referenceOffer,
  referencePeerOptions,
} from "./reference-component.ts";
import { registerTestCleanup } from "./register-test-cleanup.ts";
import { type JsonValue, protocolVersion, type RequestFrame } from "./schemas.ts";
import { createStreamTransport } from "./transports.ts";

type OutputStream = "stdout" | "stderr";
type CaptureEvent =
  | { type: "frame"; bytes: string }
  | { type: "diagnostic"; bytes: string }
  | { type: "deliver"; stream: OutputStream }
  | { type: "end"; stream: OutputStream }
  | { type: "stop" }
  | { type: "exit" };
const baseSeed = 0x51a7e204;
const completionOrders: ("exit" | OutputStream)[][] = [
  ["exit", "stdout", "stderr"],
  ["exit", "stderr", "stdout"],
  ["stdout", "exit", "stderr"],
  ["stderr", "exit", "stdout"],
  ["stdout", "stderr", "exit"],
  ["stderr", "stdout", "exit"],
];

function requireStream<T>(value: T | null): T {
  if (value === null) {
    throw new Error("The capture fixture requires worker streams.");
  }
  return value;
}

function frame(id: string, method: "initialize" | "describe" = "describe"): CaptureEvent {
  const identity = referenceIdentity(id);
  const contract = { id: method, version: protocolVersion };
  const value: RequestFrame = {
    jsonrpc: "2.0",
    id,
    method,
    params: {
      identity,
      contract,
      wireVersion: protocolVersion,
      sequence: 1,
      capabilities: [],
      input: method === "initialize" ? referenceOffer() : {},
    },
  };
  return { type: "frame", bytes: Buffer.from(` ${JSON.stringify(value)} \n`).toString("base64") };
}

function generatedCaptureTrace(seed: number): CaptureEvent[] {
  const random = createSeededGenerator(seed);
  function diagnostic(bytes: Buffer): CaptureEvent {
    return { type: "diagnostic", bytes: bytes.toString("base64") };
  }
  const events: CaptureEvent[] = [
    diagnostic(Buffer.from(`Before stop ${seed}.\n`)),
    { type: "deliver", stream: "stderr" },
    frame("initialize", "initialize"),
    { type: "deliver", stream: "stdout" },
    frame("before-stop"),
    { type: "deliver", stream: "stdout" },
  ];
  if (seed % 3 !== 0) {
    events.push({
      type: "frame",
      bytes: Buffer.from(seed % 3 === 1 ? "{}\n" : "not json\n").toString("base64"),
    });
  }
  // These bytes are written before the malformed frame stops the peer during stdout delivery.
  events.push(diagnostic(Buffer.from([0x41, 0xc3])), frame("at-stop"));
  if (seed % 3 === 0) {
    events.push({ type: "stop" });
  }
  events.push({ type: "deliver", stream: "stdout" }, { type: "stop" });
  for (let step = 0; step < 4; step++) {
    const writes = [
      diagnostic(Buffer.from([0xa9, random(256), 0x0a, 0xe2])),
      frame(`after-stop-${step}`),
    ];
    events.push(...(random(2) === 0 ? writes : writes.reverse()));
    if (random(2) === 0) {
      events.push({ type: "deliver", stream: random(2) === 0 ? "stdout" : "stderr" });
    }
    events.push({ type: "stop" });
  }
  events.push(diagnostic(Buffer.from([0x82])), frame("before-exit"), {
    type: "frame",
    bytes: Buffer.from("{").toString("base64"),
  });
  for (const completion of completionOrders[seed % completionOrders.length] ?? []) {
    if (completion === "exit") {
      events.push({ type: "exit" });
    } else {
      events.push({ type: "end", stream: completion }, { type: "deliver", stream: completion });
    }
  }
  events.push({ type: "stop" });
  return events;
}

async function runCaptureTrace(
  context: TestContext,
  kind: "scheduled" | "child",
  seed: number,
): Promise<{ stdout: string; stderr: string; late: JsonValue[] }> {
  context.signal.throwIfAborted();
  const label = `Capture seed ${seed}, ${kind}.`;
  const worker =
    kind === "child"
      ? spawn(process.execPath, [fileURLToPath(new URL("./capture-worker.ts", import.meta.url))], {
          stdio: ["pipe", "pipe", "pipe", "ipc"],
          windowsHide: true,
        })
      : new ChildProcess();
  const input = kind === "child" ? requireStream(worker.stdout) : new PassThrough();
  const output = kind === "child" ? requireStream(worker.stdin) : new PassThrough();
  const diagnostics = kind === "child" ? requireStream(worker.stderr) : new PassThrough();
  const streams: Record<OutputStream, Readable> = { stdout: input, stderr: diagnostics };
  const written: Record<OutputStream, Buffer[]> = { stdout: [], stderr: [] };
  const records: EvidenceRecord[] = [];
  const starts: string[] = [];
  const expectedLate: JsonValue[] = [];
  const pendingFrames: Buffer[] = [];
  let isStopped = false;
  let hasExited = false;
  let acknowledgements = 0;
  worker.on("message", () => {
    acknowledgements++;
  });
  worker.on("exit", () => {
    hasExited = true;
  });
  const existingDiagnosticEndListeners = diagnostics.listeners("end");
  const transport = createStreamTransport({ input, output, diagnostics, worker });
  const ownedDiagnosticEndListeners = diagnostics
    .listeners("end")
    .filter((listener) => !existingDiagnosticEndListeners.includes(listener));
  const peer = createProtocolPeer({
    ...referencePeerOptions,
    transport: {
      ...transport,
      send(value): void {
        starts.push("send");
        transport.send(value);
      },
    },
    record: (entry) => records.push(entry),
    authorize: () => starts.push("authorize"),
    handlers: {
      describe(): JsonValue {
        starts.push("handler");
        return referenceManifest;
      },
    },
  });
  input.pause();
  diagnostics.pause();
  function cleanup(): void {
    peer.close();
    worker.kill();
    input.destroy();
    output.destroy();
    diagnostics.destroy();
  }
  registerTestCleanup(context, cleanup);
  async function command(
    event: Exclude<CaptureEvent, { type: "deliver" | "stop" | "exit" }>,
  ): Promise<void> {
    if (kind === "scheduled") {
      const stream =
        event.type === "diagnostic" || ("stream" in event && event.stream === "stderr")
          ? diagnostics
          : input;
      if (event.type === "end") {
        (stream as PassThrough).end();
      } else {
        (stream as PassThrough).write(Buffer.from(event.bytes, "base64"));
      }
      return;
    }
    if (hasExited && event.type === "end") {
      return;
    }
    const before = acknowledgements;
    worker.send(event);
    await waitFor(() => expect(acknowledgements, label).toBe(before + 1));
  }
  function captured(stream: OutputStream): Buffer {
    return Buffer.concat(
      records
        .filter(
          (entry) =>
            entry.direction === "received" &&
            (stream === "stderr"
              ? entry.kind === "diagnostic"
              : entry.kind === "frame" || entry.kind === "rejected"),
        )
        .map((entry) => Buffer.from(entry.bytes ?? "", "base64")),
    );
  }
  try {
    for (const event of generatedCaptureTrace(seed)) {
      context.signal.throwIfAborted();
      const before = starts.length;
      const wasStopped = isStopped;
      if (event.type === "frame" || event.type === "diagnostic") {
        const bytes = Buffer.from(event.bytes, "base64");
        written[event.type === "frame" ? "stdout" : "stderr"].push(bytes);
        if (event.type === "frame") {
          pendingFrames.push(bytes);
        }
        await command(event);
      } else if (event.type === "stop") {
        isStopped = true;
        peer.close();
      } else if (event.type === "exit") {
        isStopped = true;
        if (kind === "child") {
          worker.send(event);
          await waitFor(() => expect(hasExited, label).toBe(true));
        } else {
          worker.emit("exit", 0, null);
        }
      } else if (event.type === "end") {
        await command(event);
      } else {
        if (event.stream === "stdout") {
          for (const bytes of pendingFrames.splice(0)) {
            let value: JsonValue;
            try {
              value = JSON.parse(bytes.toString("utf8")) as JsonValue;
            } catch {
              isStopped = true;
              continue;
            }
            if (isStopped) {
              expectedLate.push(value);
            } else if (!("jsonrpc" in Object(value))) {
              isStopped = true;
            }
          }
        }
        streams[event.stream].resume();
        await setImmediate();
        await waitFor(() => {
          const bytes = Buffer.concat(written[event.stream]);
          const complete =
            event.stream === "stdout" && !input.readableEnded
              ? bytes.subarray(0, bytes.lastIndexOf(10) + 1)
              : bytes;
          expect(captured(event.stream), label).toEqual(complete);
        });
        if (streams[event.stream].readableEnded) {
          if (event.stream === "stdout") {
            isStopped = true;
          }
        }
        streams[event.stream].pause();
      }
      await setImmediate();
      expect(peer.isStopped(), label).toBe(isStopped);
      if (wasStopped) {
        expect(starts.length, label).toBe(before);
      }
      const isReleased = isStopped && hasExited && input.readableEnded && diagnostics.readableEnded;
      expect(input.listenerCount("data"), label).toBe(isReleased ? 0 : 1);
      expect(diagnostics.listenerCount("data"), label).toBe(isReleased ? 0 : 1);
      for (const stream of ["stdout", "stderr"] as const) {
        const bytes = captured(stream);
        expect(bytes, label).toEqual(Buffer.concat(written[stream]).subarray(0, bytes.length));
      }
    }
    input.resume();
    diagnostics.resume();
    await waitFor(() => {
      expect(input.readableEnded, label).toBe(true);
      expect(diagnostics.readableEnded, label).toBe(true);
    });
    const late = records.filter((entry) => entry.kind === "late").map((entry) => entry.value);
    expect(late, label).toEqual(expectedLate);
    expect(captured("stdout"), label).toEqual(Buffer.concat(written.stdout));
    expect(captured("stderr"), label).toEqual(Buffer.concat(written.stderr));
    expect(
      records.filter((entry) => entry.kind === "exit"),
      label,
    ).toHaveLength(1);
    expect(input.listenerCount("error"), label).toBe(0);
    for (const listener of ownedDiagnosticEndListeners) {
      expect(diagnostics.listeners("end"), label).not.toContain(listener);
    }
    expect(worker.listenerCount("close"), label).toBe(0);
    return {
      stdout: captured("stdout").toString("base64"),
      stderr: captured("stderr").toString("base64"),
      late,
    };
  } finally {
    cleanup();
  }
}

test.for(Array.from({ length: 32 }, (_, batch) => batch))(
  "generated output events preserve every byte around stop exit and stream completion in batch %s",
  async (batch, context) => {
    const started = performance.now();
    const seed = baseSeed + batch * 3;
    process.stdout.write(
      `Capture seed: ${baseSeed}. Trace range: [${batch * 3}, ${(batch + 1) * 3}).\n`,
    );
    for (let run = 0; run < 3; run++) {
      await runCaptureTrace(context, "scheduled", seed + run);
    }
    process.stdout.write(`Capture batch: ${(performance.now() - started).toFixed(0)} ms.\n`);
  },
);

test.for([0, 1, 2, 3, 4, 5])(
  "real child preserves generated output trace %s",
  async (run, context) => {
    const seed = baseSeed + run;
    const expected = await runCaptureTrace(context, "scheduled", seed);
    const actual = await runCaptureTrace(context, "child", seed);
    expect(actual, `Child capture seed ${seed}.`).toEqual(expected);
  },
);

test.for([0, 1, 2, 3])(
  "malformed child output retains diagnostics and late frames through termination %s",
  async (_run, context) => {
    const worker = spawn(
      process.execPath,
      [fileURLToPath(new URL("./capture-worker.ts", import.meta.url))],
      {
        stdio: ["pipe", "pipe", "pipe", "ipc"],
        windowsHide: true,
      },
    );
    const input = requireStream(worker.stdout);
    const output = requireStream(worker.stdin);
    const diagnostics = requireStream(worker.stderr);
    const records: EvidenceRecord[] = [];
    let hasWritten = false;
    worker.on("message", () => {
      hasWritten = true;
    });
    const peer = createProtocolPeer({
      role: "broker",
      binding: referenceBinding,
      contracts: referenceContracts,
      capabilities: [],
      transport: createStreamTransport({ input, output, diagnostics, worker }),
      record: (entry) => records.push(entry),
      authorize(): void {
        throw new Error("Stopped output cannot authorize work.");
      },
      handlers: {},
    });
    registerTestCleanup(context, () => {
      peer.close();
      worker.kill();
    });
    input.pause();
    diagnostics.pause();
    worker.send({ type: "reproduce" });
    await waitFor(() => expect(hasWritten).toBe(true));
    input.resume();
    await waitFor(() => expect(records.some((entry) => entry.kind === "exit")).toBe(true));
    diagnostics.resume();
    await waitFor(() => {
      expect(input.readableEnded).toBe(true);
      expect(diagnostics.readableEnded).toBe(true);
    });
    expect(peer.isStopped()).toBe(true);
    expect(
      records
        .filter((entry) => entry.kind === "diagnostic")
        .map((entry) => entry.value)
        .join(""),
    ).toBe("Diagnostic before exit.\n");
    expect(records.filter((entry) => entry.kind === "late").map((entry) => entry.value)).toEqual([
      { afterStop: true },
    ]);
    expect(
      Buffer.concat(
        records
          .filter((entry) => entry.kind === "frame" && entry.direction === "received")
          .map((entry) => Buffer.from(entry.bytes ?? "", "base64")),
      ).toString(),
    ).toBe('{}\n{"afterStop":true}\n');
    expect(input.listenerCount("data")).toBe(0);
    expect(diagnostics.listenerCount("data")).toBe(0);
  },
);
