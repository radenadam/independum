import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { PassThrough } from "node:stream";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { expect, type TestContext, test, vi } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { createInterleavingComponent } from "./create-interleaving-component.ts";
import { createProtocolPeer, type EvidenceRecord, ProtocolError } from "./create-protocol-peer.ts";
import { createSeededGenerator } from "./create-seeded-generator.ts";
import { Invocation } from "./invocation.ts";
import { PeerLifecycle } from "./peer-lifecycle.ts";
import {
  referenceBinding,
  referenceContracts,
  referenceIdentity,
  referenceOffer,
  referenceTool,
} from "./reference-component.ts";
import { registerTestCleanup } from "./register-test-cleanup.ts";
import {
  equalJson,
  type JsonValue,
  type ProtocolFrame,
  type RequestFrame,
  roundTripJson,
} from "./schemas.ts";
import {
  createInProcessTransports,
  createStreamTransport,
  type ProtocolTransport,
  type TransportEvent,
} from "./transports.ts";

const baseSeed = 0x51a7e202;
const transitionRanges = Array.from({ length: 20 }, (_, batch) => ({
  first: batch * 500,
  end: (batch + 1) * 500,
}));

function requestFrame(id: string): RequestFrame {
  return {
    jsonrpc: "2.0",
    id,
    method: "describe",
    params: {
      wireVersion: { major: 1, minor: 0 },
      identity: referenceIdentity(id),
      contract: { id: "describe", version: { major: 1, minor: 0 } },
      capabilities: [],
      input: {},
      sequence: 1,
    },
  };
}

test.for(transitionRanges)(
  "seeded invocation transitions agree with the delivery and settlement model in range $first to $end",
  ({ first, end }, context) => {
    process.stdout.write(
      `Invocation transition seed: ${baseSeed}. Trace range: [${first}, ${end}).\n`,
    );
    const random = createSeededGenerator(baseSeed, first * 24 * 2);
    for (let run = first; run < end; run++) {
      context.signal.throwIfAborted();
      const messages: unknown[] = [];
      const ownFailure = new Error(`Invocation ${run} fails.`);
      const cancellation = new Error(`Invocation ${run} cancels.`);
      const invocation = new Invocation(requestFrame(String(run)), () => cancellation, {
        resolve: (value) => messages.push(value),
        reject: (error) => messages.push(error),
      });
      let dispatch = "absent";
      let effects = "absent";
      let isCancelled = false;
      let isTerminal = false;
      let expected: unknown;
      const trace: string[] = [];
      for (let step = 0; step < 24; step++) {
        const type = (
          [
            "send-attempted",
            "sent",
            "received",
            "cancel",
            "deadline",
            "completed",
            "failed",
            "send-failed",
            "interrupted",
          ] as const
        )[random(9)] as Exclude<Parameters<Invocation["transition"]>[0]["type"], "sent-frame">;
        trace.push(type);
        const reportedEffects = (["known", "uncertain", "absent"] as const)[random(3)] as
          | "known"
          | "uncertain"
          | "absent";
        if (!isTerminal) {
          if (type === "send-attempted" && dispatch === "absent" && !isCancelled) {
            dispatch = "uncertain";
            effects = "uncertain";
          } else if ((type === "sent" || type === "received") && dispatch === "uncertain") {
            dispatch = "known";
          } else if (type === "cancel" || type === "deadline") {
            isCancelled = true;
          } else if (
            ["completed", "failed", "send-failed", "interrupted"].includes(type) &&
            (type !== "completed" || isCancelled || dispatch === "known")
          ) {
            isTerminal = true;
            expected = type === "completed" ? (isCancelled ? cancellation : "result") : ownFailure;
          }
          if (
            type === "received" &&
            dispatch === "known" &&
            !isCancelled &&
            reportedEffects === "known"
          ) {
            effects = "known";
          }
        }
        const event =
          type === "received"
            ? { type, sequence: step + 1, effects: reportedEffects }
            : type === "completed"
              ? { type, output: "result" }
              : type === "failed" || type === "send-failed" || type === "interrupted"
                ? { type, error: ownFailure }
                : { type };
        invocation.transition(event);
        const label = `Seed ${baseSeed}, run ${run}, trace ${trace.join(",")}.`;
        expect(invocation.delivery, label).toEqual({
          dispatch,
          effects,
        });
        expect(messages, label).toEqual(isTerminal ? [expected] : []);
        expect(invocation.allows("work"), label).toBe(
          !isTerminal && !isCancelled && dispatch !== "absent",
        );
        expect(invocation.allows("dispatch"), label).toBe(
          !isTerminal && !isCancelled && dispatch === "absent",
        );
        expect(invocation.allows("reply"), label).toBe(
          !isTerminal && (isCancelled || dispatch === "known"),
        );
        expect(invocation.allows("revoke"), label).toBe(!isTerminal);
      }
      invocation.transition({ type: "interrupted", error: ownFailure });
      expect(messages).toHaveLength(1);
    }
  },
);

type FixtureKind = "in-process" | "standard-streams" | "child";
type CancellationPoint =
  | "authorize"
  | "record"
  | "send"
  | "queued"
  | "progress"
  | "terminal"
  | "settled";
interface GeneratedRequest {
  type: "request";
  id: string;
  method: "initialize" | "describe" | "dispose" | "tool.execute";
  mode?: string;
  cancelAt?: CancellationPoint;
}
type TraceEvent =
  | GeneratedRequest
  | {
      type:
        | "outgoing"
        | "incoming"
        | "incoming-last"
        | "drain"
        | "cancel-all"
        | "expiry"
        | "stop"
        | "fault"
        | "exit"
        | "evidence-failure"
        | "send-failure";
    }
  | { type: "cancel"; id: string };
interface ExpectedInvocation {
  request: GeneratedRequest;
  admitted: boolean;
  dispatch: "absent" | "known" | "uncertain";
  status: "pending" | "cancelled" | "completed" | "failed" | "interrupted";
  cancelled: boolean;
  settlements: number;
  receivedSequence: number;
  actual?: JsonValue;
}
const fixedTime = Date.UTC(2030, 0, 1);
const cancellationPoints: CancellationPoint[] = [
  "authorize",
  "record",
  "send",
  "queued",
  "progress",
  "terminal",
  "settled",
];

function generatedTrace(seed: number): TraceEvent[] {
  const random = createSeededGenerator(seed);
  const cancelAt = cancellationPoints[seed % cancellationPoints.length] as CancellationPoint;
  const events: TraceEvent[] = [
    {
      type: "request",
      id: "initialize",
      method: "initialize",
      ...(seed % 8 === 0 ? { cancelAt } : {}),
    },
    { type: "request", id: "initialize-twice", method: "initialize" },
    { type: "request", id: "early", method: "tool.execute" },
    { type: "drain" },
    { type: "request", id: "initialize-retry", method: "initialize" },
    { type: "drain" },
    { type: "request", id: "id-collision", method: "tool.execute", mode: "id-collision" },
    { type: "drain" },
    { type: "request", id: "before-dispatch", method: "tool.execute", cancelAt: "record" },
    { type: "request", id: "unrelated", method: "tool.execute", mode: "wait" },
    { type: "drain" },
    { type: "expiry" },
    { type: "request", id: "after-expiry", method: "tool.execute" },
    { type: "drain" },
    { type: "request", id: "other", method: "tool.execute", mode: "wait" },
    { type: "request", id: "busy-dispose", method: "dispose" },
    { type: "request", id: "cancel-point", method: "tool.execute", cancelAt },
  ];
  for (let step = 0; step < 16; step++) {
    const action = random(8);
    events.push(
      action < 3
        ? {
            type: (["outgoing", seed % 4 === 0 ? "incoming-last" : "incoming", "drain"] as const)[
              action
            ] as "outgoing" | "incoming" | "incoming-last" | "drain",
          }
        : action === 3
          ? { type: "cancel", id: "cancel-point" }
          : {
              type: "request",
              id: `generated-${step}`,
              method: action === 4 ? "initialize" : action === 5 ? "dispose" : "tool.execute",
              mode: (["echo", "nested", "failure", "invalid-json", "id-collision"] as const)[
                random(5)
              ] as string,
            },
    );
  }
  events.push(
    { type: "drain" },
    { type: "cancel", id: "cancel-point" },
    { type: "cancel-all" },
    { type: "drain" },
  );
  if (seed % 6 === 0) {
    events.push(
      {
        type: "request",
        id: "dispose",
        method: "dispose",
        ...(seed % 12 === 0 ? { cancelAt } : {}),
      },
      { type: "request", id: "dispose-twice", method: "dispose" },
      { type: "request", id: "during-dispose", method: "tool.execute" },
      { type: "drain" },
      { type: "request", id: "after-dispose", method: "tool.execute" },
      { type: "drain" },
    );
  } else {
    events.push(
      { type: "request", id: "at-stop", method: "tool.execute", mode: "wait" },
      { type: "drain" },
      {
        type: (["stop", "fault", "exit", "send-failure", "evidence-failure"] as const)[
          (seed % 6) - 1
        ] as "stop" | "fault" | "exit" | "send-failure" | "evidence-failure",
      },
    );
  }
  events.push({ type: "stop" }, { type: "stop" });
  return events;
}

async function runInterleaving(
  context: TestContext,
  kind: FixtureKind,
  seed: number,
  events: TraceEvent[],
): Promise<JsonValue> {
  context.signal.throwIfAborted();
  const outgoing: ProtocolFrame[] = [];
  const incoming: TransportEvent[] = [];
  const records: EvidenceRecord[] = [];
  const remoteRecords: EvidenceRecord[] = [];
  const deliveries: ProtocolFrame[] = [];
  const expected = new Map<string, ExpectedInvocation>();
  const failures: ProtocolError[] = [];
  const authorized = new Map<string, JsonValue>();
  const remoteActive = new Set<string>();
  let phase: "uninitialized" | "initializing" | "ready" | "disposing" | "disposed" | "stopped" =
    "uninitialized";
  let lifecycleOwner: string | undefined;
  let evidenceState: "available" | "failed" = "available";
  let failureMode: "none" | "evidence" | "before-send" | "after-send" = "none";
  let serializationCalls = 0;
  let terminationCount = 0;
  let cancellationDeadline = fixedTime + 60_000;
  let remotePhase: "uninitialized" | "ready" | "disposed" = "uninitialized";
  let listener: ((event: TransportEvent) => void) | undefined;
  let idle: ((entries: EvidenceRecord[]) => void) | undefined;
  let component: ReturnType<typeof createInterleavingComponent> | undefined;
  let remote: ProtocolTransport | undefined;
  let transport: ProtocolTransport;
  if (kind === "child") {
    const worker = spawn(
      process.execPath,
      [fileURLToPath(new URL("./interleaving-worker.ts", import.meta.url))],
      { stdio: ["pipe", "pipe", "pipe", "ipc"], windowsHide: true },
    );
    registerTestCleanup(context, () => worker.kill());
    worker.on("message", (message) => idle?.(message as EvidenceRecord[]));
    if (worker.stdout === null || worker.stdin === null || worker.stderr === null) {
      throw new Error("The fixture requires worker streams.");
    }
    transport = createStreamTransport({
      input: worker.stdout,
      output: worker.stdin,
      diagnostics: worker.stderr,
      worker,
    });
  } else {
    if (kind === "in-process") {
      [transport, remote] = createInProcessTransports();
    } else {
      const left = new PassThrough();
      const right = new PassThrough();
      transport = createStreamTransport({ input: left, output: right });
      remote = createStreamTransport({ input: right, output: left });
    }
    component = createInterleavingComponent(remote, (entries) => idle?.(entries));
  }
  const label = `Seed ${seed}, ${kind}, trace ${JSON.stringify(events)}.`;
  function isModelStopped(): boolean {
    return phase === "stopped";
  }
  function finishModel(invocation: ExpectedInvocation, status: ExpectedInvocation["status"]): void {
    invocation.status = status;
    if (lifecycleOwner === invocation.request.id) {
      phase =
        status === "completed"
          ? invocation.request.method === "initialize"
            ? "ready"
            : "disposed"
          : invocation.request.method === "initialize"
            ? "uninitialized"
            : "ready";
      lifecycleOwner = undefined;
    }
  }
  function stopModel(): void {
    phase = "stopped";
    lifecycleOwner = undefined;
    for (const invocation of expected.values()) {
      if (invocation.status === "pending" || invocation.status === "cancelled") {
        invocation.status = "interrupted";
      }
    }
  }
  function cancellation(id: string): void {
    const invocation = expected.get(id);
    if (invocation?.admitted !== true || isModelStopped()) {
      return;
    }
    const others = [...expected.values()]
      .filter((other) => other !== invocation)
      .map((other) => other.actual);
    if (invocation.status === "pending") {
      invocation.cancelled = true;
      if (invocation.dispatch === "absent") {
        finishModel(invocation, "failed");
      } else {
        invocation.status = "cancelled";
      }
    }
    broker.cancel(id, "Generated cancellation.", cancellationDeadline);
    expect(
      [...expected.values()].filter((other) => other !== invocation).map((other) => other.actual),
      label,
    ).toEqual(others);
  }
  const broker = createProtocolPeer({
    role: "broker",
    binding: referenceBinding,
    contracts: referenceContracts,
    capabilities: ["fixture.read"],
    transport: {
      ...transport,
      listen(callback): void {
        listener = callback;
        transport.listen((event) => incoming.push(event));
      },
      // The scheduler owns stop delivery, while teardown owns actual worker exit.
      close(): void {},
      terminate(): void {
        terminationCount++;
      },
      send(value): void {
        const frame = value as ProtocolFrame;
        expect(
          records.some(
            (entry) =>
              entry.kind === "frame" && entry.direction === "sent" && equalJson(entry.value, frame),
          ),
          label,
        ).toBe(true);
        const invocation =
          "params" in frame ? expected.get(frame.params.identity.invocationId) : undefined;
        if ("method" in frame && "id" in frame && invocation !== undefined) {
          invocation.dispatch = "known";
        }
        if (failureMode === "before-send" || failureMode === "after-send") {
          if (invocation !== undefined) {
            invocation.dispatch = "uncertain";
          }
          if (failureMode === "after-send") {
            outgoing.push(frame);
          }
          stopModel();
          throw new Error("The generated send fails.");
        }
        outgoing.push(frame);
        if ("method" in frame && "id" in frame && invocation?.request.cancelAt === "send") {
          cancellation(invocation.request.id);
        }
      },
    },
    record(entry): void {
      if (failureMode === "evidence") {
        evidenceState = "failed";
        stopModel();
        throw new Error("The generated evidence sink fails.");
      }
      expect(evidenceState, label).toBe("available");
      records.push(entry);
      const invocation = expected.get(entry.invocationId ?? "");
      if (invocation === undefined || entry.kind !== "frame") {
        return;
      }
      const frame = entry.value as unknown as ProtocolFrame;
      const point = invocation.request.cancelAt;
      if (
        (point === "record" && entry.direction === "sent" && "method" in frame && "id" in frame) ||
        (entry.direction === "received" &&
          ((point === "terminal" && !("method" in frame)) ||
            (point === "progress" && "method" in frame && frame.method === "progress")))
      ) {
        cancellation(invocation.request.id);
      }
    },
    authorize(request): void {
      authorized.set(request.params.identity.invocationId, request.params.input);
      if (expected.get(request.params.identity.invocationId)?.request.cancelAt === "authorize") {
        cancellation(request.params.identity.invocationId);
      }
    },
    handlers: {
      "state.read"(): JsonValue {
        return { value: { key: "sample" }, revision: "recorded-1" };
      },
    },
  });
  function cleanup(): void {
    broker.close();
    component?.close();
    remote?.close();
    transport.close();
    if (transport.canTerminate) {
      transport.terminate();
    }
  }
  registerTestCleanup(context, () => {
    vi.useRealTimers();
    cleanup();
  });
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(fixedTime);
  function request(event: GeneratedRequest): void {
    const hasPending = [...expected.values()].some(
      (value) => value.admitted && (value.status === "pending" || value.status === "cancelled"),
    );
    const admitted =
      event.method === "initialize"
        ? phase === "uninitialized"
        : phase === "ready" && (event.method !== "dispose" || !hasPending);
    const invocation: ExpectedInvocation = {
      request: event,
      admitted: admitted && event.mode !== "invalid-json",
      dispatch: "absent",
      status: "pending",
      cancelled: false,
      settlements: 0,
      receivedSequence: 0,
    };
    expected.set(event.id, invocation);
    if (!invocation.admitted) {
      invocation.status = "failed";
    } else if (event.method === "initialize" || event.method === "dispose") {
      phase = event.method === "initialize" ? "initializing" : "disposing";
      lifecycleOwner = event.id;
    }
    let input: JsonValue =
      event.method === "initialize"
        ? referenceOffer()
        : event.method === "dispose"
          ? { reason: "The generated fixture ends." }
          : event.method === "describe"
            ? {}
            : {
                definition: referenceTool,
                arguments: { mode: event.mode ?? "echo", value: { seed, id: event.id } },
                handles: [],
              };
    if (event.mode === "invalid-json") {
      const value = [seed];
      const prototype = Object.create(Array.prototype) as object;
      Object.defineProperty(prototype, "toJSON", {
        value: () => {
          serializationCalls++;
          return [serializationCalls];
        },
      });
      Object.setPrototypeOf(value, prototype);
      input = { definition: referenceTool, arguments: { mode: "echo", value }, handles: [] };
    }
    const promise = broker.request(
      event.method,
      referenceIdentity(event.id),
      input,
      event.method === "tool.execute" ? ["fixture.read"] : [],
    );
    void promise.then(
      (output) => {
        invocation.actual = { output };
        invocation.settlements++;
      },
      (error: unknown) => {
        expect(error, label).toBeInstanceOf(ProtocolError);
        const problem = error as ProtocolError;
        failures.push(problem);
        invocation.actual = roundTripJson({ message: problem.message, failure: problem.failure });
        invocation.settlements++;
      },
    );
    if (event.cancelAt === "queued") {
      cancellation(event.id);
    }
    if (event.method === "tool.execute" && event.mode !== "invalid-json") {
      (input as { arguments: { value: JsonValue } }).arguments.value =
        "Mutation after acquisition.";
    }
  }
  async function deliverOutgoing(): Promise<void> {
    const frame = outgoing.shift();
    if (frame === undefined || isModelStopped()) {
      return;
    }
    const entries = await new Promise<EvidenceRecord[]>((resolve, reject) => {
      function aborted(): void {
        reject(context.signal.reason);
      }
      context.signal.addEventListener("abort", aborted, { once: true });
      function receivedEntries(entries: EvidenceRecord[]): void {
        context.signal.removeEventListener("abort", aborted);
        resolve(entries);
      }
      idle = receivedEntries;
      deliveries.push(frame);
      transport.send(frame);
    });
    idle = undefined;
    remoteRecords.push(...entries);
    for (const entry of entries) {
      if (entry.kind !== "frame") {
        continue;
      }
      const value = entry.value as unknown as ProtocolFrame;
      if (entry.direction === "received" && "method" in value && "id" in value) {
        remoteActive.add(value.params.identity.invocationId);
      } else if (entry.direction === "sent" && !("method" in value)) {
        const id = (value.result ?? value.error?.data)?.identity?.invocationId as string;
        remoteActive.delete(id);
        if (value.result !== undefined) {
          if (value.result.contract.id === "initialize") {
            expect(remotePhase, label).toBe("uninitialized");
            remotePhase = "ready";
          } else if (value.result.contract.id === "dispose") {
            expect(remoteActive.size, label).toBe(0);
            expect(remotePhase, label).toBe("ready");
            expect(value.result.output, label).toEqual({ disposed: true, activitiesEnded: true });
            remotePhase = "disposed";
          } else {
            expect(remotePhase, label).toBe("ready");
          }
        }
      }
    }
    const sentCount = remoteRecords.filter(
      (entry) => entry.kind === "frame" && entry.direction === "sent",
    ).length;
    await waitFor(() =>
      expect(
        incoming.filter((event) => event.type === "message").length + receivedCount,
        label,
      ).toBe(sentCount),
    );
  }
  let receivedCount = 0;
  function deliverIncoming(doesTakeLast = false): void {
    const event = incoming.splice(doesTakeLast ? incoming.length - 1 : 0, 1)[0];
    if (event === undefined) {
      return;
    }
    if (event.type === "message") {
      receivedCount++;
      const frame = event.value as ProtocolFrame;
      const details = "params" in frame ? frame.params : (frame.result ?? frame.error?.data);
      const invocation = expected.get(details?.identity?.invocationId ?? "");
      if (
        !isModelStopped() &&
        invocation !== undefined &&
        (invocation.status === "pending" || invocation.status === "cancelled")
      ) {
        if (details?.sequence !== invocation.receivedSequence + 1) {
          stopModel();
        } else {
          invocation.receivedSequence = details.sequence;
        }
      }
      listener?.(event);
      if (
        !isModelStopped() &&
        !("method" in frame) &&
        invocation !== undefined &&
        (invocation.status === "pending" || invocation.status === "cancelled")
      ) {
        if (frame.result !== undefined && invocation.status !== "cancelled") {
          if (
            invocation.request.method === "initialize" ||
            invocation.request.method === "dispose"
          ) {
            expect(lifecycleOwner, label).toBe(invocation.request.id);
            expect(phase, label).toBe(
              invocation.request.method === "initialize" ? "initializing" : "disposing",
            );
          }
          if (invocation.request.method === "dispose") {
            expect(
              [...expected.values()].filter(
                (other) =>
                  other !== invocation &&
                  other.admitted &&
                  (other.status === "pending" || other.status === "cancelled"),
              ),
              label,
            ).toHaveLength(0);
          }
        }
        finishModel(
          invocation,
          invocation.status === "cancelled" || "error" in frame ? "failed" : "completed",
        );
        if (invocation.request.cancelAt === "settled") {
          cancellation(invocation.request.id);
        }
      }
    } else {
      listener?.(event);
    }
  }
  async function drain(): Promise<void> {
    for (
      let iteration = 0;
      iteration < 100 && !isModelStopped() && (outgoing.length > 0 || incoming.length > 0);
      iteration++
    ) {
      await deliverOutgoing();
      while (incoming.length > 0) {
        deliverIncoming();
      }
    }
    expect(outgoing.length === 0 || isModelStopped(), label).toBe(true);
  }
  try {
    for (const event of events) {
      context.signal.throwIfAborted();
      if (event.type === "request") {
        request(event);
      } else if (event.type === "outgoing") {
        await deliverOutgoing();
      } else if (event.type === "incoming") {
        deliverIncoming();
      } else if (event.type === "incoming-last") {
        deliverIncoming(true);
      } else if (event.type === "drain") {
        await drain();
      } else if (event.type === "cancel") {
        cancellation(event.id);
      } else if (event.type === "cancel-all") {
        for (const invocation of expected.values()) {
          if (invocation.status === "pending") {
            cancellation(invocation.request.id);
          }
        }
      } else if (event.type === "expiry") {
        const before = terminationCount;
        await vi.advanceTimersByTimeAsync(60_001);
        cancellationDeadline += 60_001;
        expect(terminationCount, label).toBe(before);
        expect(broker.isStopped(), label).toBe(isModelStopped());
        const other = expected.get("unrelated");
        if (other?.admitted) {
          expect(other.actual, label).toBeUndefined();
        }
      } else if (event.type === "stop") {
        stopModel();
        broker.close();
      } else if (event.type === "evidence-failure") {
        failureMode = "evidence";
        request({ type: "request", id: "evidence-failure", method: "tool.execute" });
      } else if (event.type === "send-failure") {
        failureMode = (seed >>> 3) % 2 === 0 ? "before-send" : "after-send";
        request({ type: "request", id: "send-failure", method: "tool.execute" });
      } else {
        stopModel();
        listener?.(
          event.type === "exit"
            ? { type: "exit", code: 23, signal: null }
            : { type: "fault", reason: "Generated malformed bytes.", bytes: "/w==" },
        );
      }
      await setImmediate();
      expect(broker.isStopped(), label).toBe(isModelStopped());
      for (const invocation of expected.values()) {
        const isTerminal = invocation.status !== "pending" && invocation.status !== "cancelled";
        expect(invocation.settlements, label).toBe(isTerminal ? 1 : 0);
        if (invocation.actual !== undefined && "failure" in Object(invocation.actual)) {
          expect(invocation.actual, label).toMatchObject({
            failure: {
              identity: { invocationId: invocation.request.id },
              contract: { id: invocation.request.method },
              dispatch: invocation.dispatch,
              effects: invocation.dispatch === "absent" ? "absent" : "uncertain",
            },
          });
          if (invocation.cancelled && invocation.status === "failed") {
            expect(invocation.actual, label).toMatchObject({ failure: { kind: "cancellation" } });
          }
        }
      }
    }
    expect(serializationCalls, label).toBe(0);
    expect(new Set(failures).size, label).toBe(failures.length);
    expect(new Set(failures.map((error) => error.failure)).size, label).toBe(failures.length);
    for (const [id, input] of authorized) {
      if (expected.get(id)?.request.method === "tool.execute") {
        expect(input, label).toMatchObject({ arguments: { value: { seed, id } } });
      }
    }
    for (const entries of [records, remoteRecords]) {
      const sequences = new Map<string | null, number>();
      for (const entry of entries) {
        expect(entry.sequence, label).toBe((sequences.get(entry.invocationId) ?? 0) + 1);
        sequences.set(entry.invocationId, entry.sequence);
      }
    }
    return roundTripJson({
      outcomes: [...expected.values()].map((invocation) => ({
        id: invocation.request.id,
        actual: invocation.actual ?? null,
      })),
      records,
      remoteRecords,
      deliveries,
      phase,
    });
  } finally {
    vi.useRealTimers();
    cleanup();
  }
}

test.for(Array.from({ length: 64 }, (_, batch) => batch))(
  "generated traces are differential in batch %s",
  async (batch, context) => {
    const started = performance.now();
    const seed = baseSeed + batch * 4;
    process.stdout.write(
      `Differential seed: ${baseSeed}. Trace range: [${batch * 4}, ${(batch + 1) * 4}). Transports: in-process, standard-streams.\n`,
    );
    for (let run = 0; run < 4; run++) {
      const events = generatedTrace(seed + run);
      const left = await runInterleaving(context, "in-process", seed + run, events);
      const right = await runInterleaving(context, "standard-streams", seed + run, events);
      expect(right, `Differential seed ${seed + run}.`).toEqual(left);
    }
    process.stdout.write(
      `Differential batch ${batch}: ${(performance.now() - started).toFixed(0)} ms.\n`,
    );
  },
);

test.for([0, 1, 2, 3, 4, 5, 6, 7])(
  "real child matches generated trace %s",
  async (run, context) => {
    const started = performance.now();
    const seed = baseSeed + run;
    const events = generatedTrace(seed);
    process.stdout.write(`Child differential seed: ${seed}. Traces: 1.\n`);
    const expected = await runInterleaving(context, "in-process", seed, events);
    const actual = await runInterleaving(context, "child", seed, events);
    expect(actual, `Child differential seed ${seed}.`).toEqual(expected);
    process.stdout.write(
      `Child differential ${run}: ${(performance.now() - started).toFixed(0)} ms.\n`,
    );
  },
);
test.for(transitionRanges)(
  "seeded lifecycle transitions reserve admission and ignore stale completion in range $first to $end",
  ({ first, end }, context) => {
    process.stdout.write(`Peer lifecycle seed: ${baseSeed}. Trace range: [${first}, ${end}).\n`);
    const random = createSeededGenerator(baseSeed, first * 24 * 3);
    const selection = {
      wireVersion: { major: 1, minor: 0 },
      manifestVersion: { major: 1, minor: 0 },
      contracts: referenceContracts,
      componentInstanceId: "reference",
      grantedCapabilities: ["fixture.read"],
    };
    for (let run = first; run < end; run++) {
      context.signal.throwIfAborted();
      const lifecycle = new PeerLifecycle();
      let phase: string = "uninitialized";
      let owner: object | undefined;
      let canRecord = true;
      const tokens = [{}, {}, {}];
      for (let step = 0; step < 24; step++) {
        const action = random(7);
        const token = tokens[random(tokens.length)] as object;
        const hasPending = random(2) === 0;
        if (action < 3) {
          const method = (["initialize", "dispose", "describe"] as const)[action] as
            | "initialize"
            | "dispose"
            | "describe";
          const admitted =
            method === "initialize"
              ? phase === "uninitialized"
              : phase === "ready" && (method !== "dispose" || !hasPending);
          if (admitted) {
            lifecycle.admit(method, token, hasPending);
            if (method !== "describe") {
              phase = method === "initialize" ? "initializing" : "disposing";
              owner = token;
            }
          } else {
            expect(() => lifecycle.admit(method, token, hasPending)).toThrow();
          }
        } else if (action === 3 || action === 4) {
          const type = action === 3 ? "completed" : "failed";
          lifecycle.transition({ type, invocation: token, selection });
          if (token === owner && (phase === "initializing" || phase === "disposing")) {
            phase =
              phase === "initializing"
                ? type === "completed"
                  ? "ready"
                  : "uninitialized"
                : type === "completed"
                  ? "disposed"
                  : "ready";
            owner = undefined;
          }
        } else {
          lifecycle.transition({ type: action === 5 ? "stop" : "evidence-failed" });
          phase = "stopped";
          if (action === 6) {
            canRecord = false;
          }
        }
        expect(lifecycle.phase, `Seed ${baseSeed}, run ${run}, step ${step}.`).toBe(phase);
        expect(lifecycle.canRecord).toBe(canRecord);
        expect(lifecycle.selection).toEqual(
          phase === "ready" || phase === "disposing" ? selection : undefined,
        );
        expect(lifecycle.allows("work", token, "initialize")).toBe(
          phase === "ready" || (phase === "initializing" && owner === token),
        );
        expect(lifecycle.allows("work", token, "dispose")).toBe(
          phase === "ready" || (phase === "disposing" && owner === token),
        );
        expect(lifecycle.allows("work", token, "tool.execute")).toBe(phase === "ready");
        expect(lifecycle.allows("terminal", token)).toBe(phase !== "stopped");
      }
    }
  },
);
