import { PassThrough } from "node:stream";
import { setImmediate } from "node:timers/promises";
import { expect, type TestContext, test, vi } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { createProtocolPeer, type EvidenceRecord, ProtocolError } from "./create-protocol-peer.ts";
import { createWorkerTransport } from "./create-worker-transport.ts";
import { Invocation } from "./invocation.ts";
import {
  createReferenceComponent,
  referenceBinding,
  referenceContracts,
  referenceIdentity,
  referenceOffer,
  referenceTool,
} from "./reference-component.ts";
import { registerTestCleanup } from "./register-test-cleanup.ts";
import { equalJson, type JsonValue, type ProtocolFrame, type RequestFrame } from "./schemas.ts";
import {
  createInProcessTransports,
  createStreamTransport,
  type ProtocolTransport,
  type TransportEvent,
} from "./transports.ts";

const baseSeed = 0x51a7e202;

function generator(seed: number): (limit: number) => number {
  let value = seed;
  return (limit) => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) % limit;
  };
}

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

test("seeded invocation transitions agree with an independent delivery and settlement model", (context) => {
  process.stdout.write(`Invocation transition seed: ${baseSeed}. Runs: 10000.\n`);
  const random = generator(baseSeed);
  for (let run = 0; run < 10_000; run++) {
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
    }
    invocation.transition({ type: "interrupted", error: ownFailure });
    expect(messages).toHaveLength(1);
  }
});

interface ExpectedInvocation {
  id: string;
  value: JsonValue;
  mode: string;
  dispatch: "known" | "uncertain" | "absent";
  sequence: number;
  isCancelled: boolean;
  outcome?: "success" | "failure" | "cancelled" | "interrupted";
  actual?: JsonValue | ProtocolError;
  settlements: number;
  hasRecordedSettlement?: boolean;
}
type FixtureKind = "in-process" | "standard-streams" | "child";

async function runInterleaving(
  context: TestContext,
  kind: FixtureKind,
  seed: number,
  cleanups: Set<() => void>,
): Promise<void> {
  context.signal.throwIfAborted();
  const random = generator(seed);
  const pending: TransportEvent[] = [];
  const evidence: EvidenceRecord[] = [];
  const expected = new Map<string, ExpectedInvocation>();
  const sends: ProtocolFrame[] = [];
  const authorized = new Map<string, JsonValue>();
  const trace: string[] = [];
  let isStopped = false;
  let shouldFailEvidence = false;
  let sendFailure: "before" | "after" | undefined;
  let shouldCancelDuringRecording = false;
  let serializationCalls = 0;
  let listener: ((event: TransportEvent) => void) | undefined;
  let component: ReturnType<typeof createReferenceComponent> | undefined;
  let remote: ProtocolTransport | undefined;
  let transport: ProtocolTransport;
  if (kind === "child") {
    transport = createWorkerTransport(context, new URL("./reference-worker.ts", import.meta.url));
  } else {
    if (kind === "in-process") {
      [transport, remote] = createInProcessTransports();
    } else {
      const left = new PassThrough();
      const right = new PassThrough();
      transport = createStreamTransport({ input: left, output: right });
      remote = createStreamTransport({ input: right, output: left });
    }
    component = createReferenceComponent(remote, (entry) => {
      if (entry.kind === "frame" && entry.direction === "received") {
        const frame = entry.value as unknown as ProtocolFrame;
        if ("method" in frame && "id" in frame) {
          expect(sends.some((sent) => equalJson(sent, frame))).toBe(true);
        }
      }
    });
  }
  function stopModel(): void {
    isStopped = true;
    for (const invocation of expected.values()) {
      invocation.outcome ??= "interrupted";
    }
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
        transport.listen((event) => pending.push(event));
      },
      send(value): void {
        const frame = value as ProtocolFrame;
        expect(
          evidence.some(
            (entry) =>
              entry.direction === "sent" && entry.kind === "frame" && equalJson(entry.value, frame),
          ),
        ).toBe(true);
        const failure = sendFailure;
        sendFailure = undefined;
        if (failure !== "before") {
          sends.push(frame);
          transport.send(frame);
        }
        if (failure !== undefined) {
          if ("id" in frame && "method" in frame) {
            const invocation = expected.get(frame.params.identity.invocationId);
            if (invocation !== undefined) {
              invocation.dispatch = "uncertain";
            }
          }
          stopModel();
          throw new Error(`Seed ${seed} send fails ${failure} delivery.`);
        }
      },
    },
    record(entry): void {
      if (shouldFailEvidence) {
        const invocation = expected.get(entry.invocationId ?? "");
        if (
          invocation !== undefined &&
          !sends.some(
            (frame) => "params" in frame && frame.params.identity.invocationId === invocation.id,
          )
        ) {
          invocation.dispatch = "absent";
        }
        stopModel();
        throw new Error("The generated evidence sink fails.");
      }
      evidence.push(entry);
      if (shouldCancelDuringRecording && entry.direction === "sent" && entry.kind === "frame") {
        const frame = entry.value as unknown as ProtocolFrame;
        if ("method" in frame && "id" in frame && frame.method === "tool.execute") {
          const invocation = expected.get(frame.params.identity.invocationId) as ExpectedInvocation;
          invocation.dispatch = "absent";
          invocation.outcome = "cancelled";
          shouldCancelDuringRecording = false;
          broker.cancel(invocation.id, "Cancellation during evidence commit.", Date.now() + 5000);
        }
      }
    },
    authorize(request): void {
      authorized.set(request.params.identity.invocationId, request.params.input);
      if (request.method === "state.read") {
        expect(
          evidence.some(
            (entry) =>
              entry.direction === "received" &&
              entry.kind === "frame" &&
              equalJson(entry.value, request),
          ),
        ).toBe(true);
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
  }
  cleanups.add(cleanup);
  function deliver(index = 0): void {
    const event = pending.splice(index, 1)[0];
    if (event === undefined) {
      return;
    }
    if (shouldFailEvidence) {
      stopModel();
    }
    if (!isStopped) {
      if (event.type === "end" || event.type === "exit" || event.type === "fault") {
        stopModel();
      } else if (event.type === "message") {
        if (event.value === null) {
          stopModel();
        } else {
          const frame = event.value as ProtocolFrame;
          const details = "params" in frame ? frame.params : (frame.result ?? frame.error?.data);
          const invocation = expected.get(details?.identity?.invocationId ?? "");
          if (
            invocation !== undefined &&
            invocation.outcome === undefined &&
            details !== undefined
          ) {
            if (details.sequence !== invocation.sequence + 1) {
              stopModel();
            } else {
              invocation.sequence = details.sequence;
              if (!("method" in frame)) {
                invocation.outcome = invocation.isCancelled
                  ? "cancelled"
                  : "error" in frame
                    ? "failure"
                    : "success";
              }
            }
          }
        }
      }
    }
    const before = evidence.length;
    listener?.(event);
    if (event.type === "message" && !shouldFailEvidence) {
      expect(evidence[before]).toMatchObject({
        kind: "frame",
        direction: "received",
        value: event.value,
      });
    }
  }
  let isInitialized = false;
  const initialization = broker
    .request("initialize", referenceIdentity("initialize"), referenceOffer())
    .then(() => {
      isInitialized = true;
    });
  await waitFor(() => {
    while (pending.length > 0) {
      deliver();
    }
    expect(isInitialized).toBe(true);
  });
  await initialization;
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  try {
    function send(special?: "invalid-json" | "cancel-in-record"): void {
      const id = `seed-${seed}-${expected.size}`;
      const mode = (["echo", "wait", "failure", "nested"] as const)[random(4)] as string;
      const value: JsonValue = { b: [seed, expected.size], a: { authorized: true } };
      const invocation: ExpectedInvocation = {
        id,
        value,
        mode,
        dispatch: isStopped || special === "invalid-json" ? "absent" : "known",
        sequence: 0,
        isCancelled: false,
        settlements: 0,
      };
      expected.set(id, invocation);
      if (special === "invalid-json") {
        invocation.outcome = "failure";
      }
      const input: {
        definition: JsonValue;
        arguments: { mode: string; value: JsonValue };
        handles: string[];
      } = {
        definition: Object.fromEntries(Object.entries(referenceTool as object).reverse()),
        arguments: { mode, value },
        handles: [],
      };
      if (special === "invalid-json") {
        const array = [seed];
        const prototype = Object.create(Array.prototype) as object;
        Object.defineProperty(prototype, "toJSON", {
          value: () => {
            serializationCalls++;
            return [serializationCalls];
          },
        });
        Object.setPrototypeOf(array, prototype);
        input.arguments.value = array;
      }
      shouldCancelDuringRecording = special === "cancel-in-record";
      const promise = broker.request(
        "tool.execute",
        { ...referenceIdentity(id), deadline: Date.now() + 10_000 },
        input,
        ["fixture.read"],
      );
      function observe(actual: JsonValue | ProtocolError): void {
        invocation.actual = actual;
        invocation.settlements++;
        invocation.hasRecordedSettlement =
          (actual instanceof ProtocolError &&
            (broker.isStopped() || actual.failure.dispatch === "absent")) ||
          evidence.some(
            (entry) =>
              entry.invocationId === id &&
              entry.direction === "received" &&
              entry.kind === "frame" &&
              !("method" in Object(entry.value)),
          );
      }
      void promise.then(observe, (error: unknown) => observe(error as ProtocolError));
      input.arguments.value = "Mutation after acquisition.";
    }
    send();
    send();
    send();
    send("invalid-json");
    send("cancel-in-record");
    for (let step = 0; step < 20; step++) {
      context.signal.throwIfAborted();
      const action = random(13);
      trace.push(String(action));
      const values = [...expected.values()];
      const invocation = values[random(values.length)] as ExpectedInvocation;
      if (action < 4) {
        deliver(action === 0 ? random(pending.length || 1) : 0);
      } else if (action === 4 && !isStopped) {
        if (invocation.dispatch === "absent" && invocation.outcome === "failure") {
          expect(() =>
            broker.cancel(invocation.id, "Generated cancellation.", Date.now() + 5000),
          ).toThrow("unknown");
        } else {
          if (invocation.outcome === undefined) {
            invocation.isCancelled = true;
          }
          broker.cancel(invocation.id, "Generated cancellation.", Date.now() + 5000);
        }
      } else if (action === 5) {
        if (isStopped) {
          const size = expected.size;
          send();
          const rejected = [...expected.values()][size] as ExpectedInvocation;
          rejected.outcome = "failure";
        } else {
          send();
        }
      } else if (action === 6 && !isStopped) {
        pending.push({ type: "message", value: null });
      } else if (action === 7 && !isStopped) {
        pending.push({ type: "exit", code: 23, signal: null });
      } else if (action === 8 && !isStopped) {
        sendFailure = random(2) === 0 ? "before" : "after";
        send();
      } else if (action === 9 && !isStopped) {
        stopModel();
        broker.close();
      } else if (action === 10 && !isStopped) {
        pending.push({ type: "fault", reason: "Generated malformed bytes.", bytes: "/w==" });
      } else if (action === 11 && !isStopped) {
        const hasPending = [...expected.values()].some((value) => value.outcome === undefined);
        for (const value of expected.values()) {
          if (value.outcome === undefined) {
            value.isCancelled = true;
          }
        }
        await vi.advanceTimersByTimeAsync(10_001);
        if (kind === "child" && hasPending) {
          stopModel();
        }
      } else if (action === 12 && !isStopped) {
        shouldFailEvidence = true;
        if (pending.length > 0) {
          deliver();
        } else {
          send();
        }
      }
      await setImmediate();
      expect(broker.isStopped(), `Seed ${seed}, trace ${trace.join(",")}.`).toBe(isStopped);
      if (isStopped) {
        expect(
          [...expected.values()].every((value) => value.settlements === 1),
          `Seed ${seed}, stopped at ${trace.join(",")}.`,
        ).toBe(true);
      }
    }
    shouldFailEvidence = false;
    stopModel();
    broker.close();
    while (pending.length > 0) {
      deliver();
    }
    await setImmediate();
    const label = `Seed ${seed}, ${kind}, trace ${trace.join(",")}.`;
    const failures: ProtocolError[] = [];
    for (const invocation of expected.values()) {
      expect(invocation.settlements, label).toBe(1);
      expect(invocation.hasRecordedSettlement, label).toBe(true);
      if (invocation.outcome === "success") {
        expect(invocation.actual, label).toMatchObject({
          structuredData:
            invocation.mode === "nested"
              ? { value: { key: "sample" }, revision: "recorded-1" }
              : invocation.value,
        });
      } else {
        expect(invocation.actual, label).toBeInstanceOf(ProtocolError);
        const error = invocation.actual as ProtocolError;
        failures.push(error);
        expect(error.failure.identity?.invocationId, label).toBe(invocation.id);
        expect(error.failure.contract.id, label).toBe("tool.execute");
        expect(error.failure.dispatch, label).toBe(invocation.dispatch);
        expect(error.failure.effects, label).toBe(
          invocation.dispatch === "absent" ? "absent" : "uncertain",
        );
        if (invocation.outcome === "cancelled") {
          expect(error.failure.kind, label).toBe("cancellation");
        }
      }
      const input = authorized.get(invocation.id) as
        | { arguments: { value: JsonValue } }
        | undefined;
      if (input !== undefined) {
        expect(input.arguments.value, label).toEqual(invocation.value);
      }
    }
    expect(new Set(failures).size, label).toBe(failures.length);
    expect(new Set(failures.map((error) => error.failure)).size, label).toBe(failures.length);
    expect(serializationCalls, label).toBe(0);
    for (const entry of evidence.filter((entry) => entry.kind === "interrupted")) {
      expect(entry.value, label).toMatchObject({
        failure: { identity: { invocationId: entry.invocationId } },
      });
      expect(
        evidence.filter(
          (candidate) =>
            candidate.kind === "interrupted" && candidate.invocationId === entry.invocationId,
        ),
        label,
      ).toHaveLength(1);
    }
  } finally {
    vi.useRealTimers();
    cleanup();
    cleanups.delete(cleanup);
  }
}

async function runSeedBatch(
  context: TestContext,
  kind: FixtureKind,
  seed: number,
  count: number,
): Promise<void> {
  process.stdout.write(`Invocation ${kind} seed: ${seed}. Runs: ${count}.\n`);
  const cleanups = new Set<() => void>();
  registerTestCleanup(context, () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    vi.useRealTimers();
  });
  for (let run = 0; run < count; run++) {
    try {
      await runInterleaving(context, kind, seed + run, cleanups);
    } catch (error) {
      process.stderr.write(`Failing invocation seed: ${seed + run}. Transport: ${kind}.\n`);
      throw error;
    }
  }
}

test.for(
  (["in-process", "standard-streams"] as const).flatMap((kind) =>
    [0, 1, 2, 3].map((batch) => ({ kind, batch })),
  ),
)(
  "$kind runs seeded queued transport interleavings in batch $batch",
  async ({ kind, batch }, context) => {
    const seed = baseSeed + batch * 32 + (kind === "in-process" ? 0 : 128);
    await runSeedBatch(context, kind, seed, 32);
  },
);

test.for([0, 1, 2, 3, 4, 5, 6, 7])(
  "real child runs seeded interleaving %s",
  async (run, context) => {
    const seed = baseSeed + 256 + run;
    await runSeedBatch(context, "child", seed, 1);
  },
);
