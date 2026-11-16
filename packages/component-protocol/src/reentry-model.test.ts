import { setImmediate } from "node:timers/promises";
import { expect, type TestContext, test } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { createPeerFixture } from "./create-peer-fixture.ts";
import {
  createProtocolPeer,
  type EvidenceRecord,
  type InvocationContext,
  type ProtocolPeer,
} from "./create-protocol-peer.ts";
import { createWorkerTransport } from "./create-worker-transport.ts";
import {
  referenceBinding,
  referenceContracts,
  referenceIdentity,
  referenceOffer,
  referencePeerOptions,
  referenceTool,
} from "./reference-component.ts";
import { registerTestCleanup } from "./register-test-cleanup.ts";
import {
  type JsonValue,
  type ProtocolFrame,
  type RequestFrame,
  type ResponseFrame,
  roundTripJson,
} from "./schemas.ts";
import type { ProtocolTransport } from "./transports.ts";

type Role = "broker" | "component";
type Action = "cancel" | "send" | "stop" | "close" | "dispose" | "nested" | "repeat";
type Scenario = "complete" | "reject" | "cancel" | "waiting" | "dispose" | "stop" | "throw";
type HandlerKind = "sync" | "async";
interface CallbackPoint {
  role: Role;
  name: string;
  id: string;
}
interface Injection {
  point: number;
  actions: Action[];
  isDeferred: boolean;
}
interface NotificationCall {
  method: "progress" | "log";
  data: JsonValue;
  isBeforeOutcome: boolean;
}
const actions: Action[][] = [
  ["cancel"],
  ["send"],
  ["stop"],
  ["close"],
  ["dispose"],
  ["nested"],
  ["repeat"],
  ["send", "cancel", "nested", "repeat", "dispose", "stop", "close"],
  ["nested", "repeat", "dispose", "send", "cancel", "close", "stop"],
];
const scenarios: Scenario[] = ["complete", "reject", "cancel", "waiting", "dispose", "stop"];
const seed = 0x51a7e205;

async function runReentryTrace(
  context: TestContext,
  kind: ProtocolTransport["kind"],
  scenario: Scenario,
  injection?: Injection,
  handlerKind: HandlerKind = "sync",
): Promise<{ points: CallbackPoint[]; result: JsonValue }> {
  context.signal.throwIfAborted();
  const fixture = createPeerFixture(kind);
  const { peers, listeners } = fixture;
  const contexts = new Map<string, InvocationContext>();
  const points: CallbackPoint[] = [];
  const records: { role: Role; entry: EvidenceRecord }[] = [];
  const requests: RequestFrame[] = [];
  const notifications = new Map<string, NotificationCall[]>();
  const handlerOutcomes = new Map<string, { output?: JsonValue; message?: string }>();
  const outcomes: { name: string; value: JsonValue }[] = [];
  const operations: string[] = [];
  const roles: Role[] = ["broker", "component"];
  let isTesting = true;
  let didInject = false;
  let nextOperation = 0;
  function observe(name: string, promise: Promise<JsonValue>): void {
    void promise.then(
      (value) => outcomes.push({ name, value }),
      (error: unknown) =>
        outcomes.push({
          name,
          value: { error: error instanceof Error ? error.message : "Unknown failure." },
        }),
    );
  }
  function notify(
    role: Role,
    id: string,
    invocation: InvocationContext,
    method: "progress" | "log",
    value: JsonValue,
  ): void {
    const key = `${role}:${id}`;
    const data = method === "progress" ? { value } : { level: "info", message: value };
    notifications.set(key, [
      ...(notifications.get(key) ?? []),
      { method, data: roundTripJson(data), isBeforeOutcome: !handlerOutcomes.has(key) },
    ]);
    try {
      if (method === "progress") {
        invocation.progress(value);
      } else {
        invocation.log("info", value as string);
      }
    } finally {
      fixture.mutate(value);
    }
  }
  function inject(point: CallbackPoint, action: Action, invocation?: InvocationContext): void {
    const peer = peers[point.role];
    const id = `injected-${++nextOperation}`;
    operations.push(`${point.role}:${action}`);
    if (action === "cancel") {
      peer.cancel(point.id, "Generated re-entry.", Date.UTC(2040, 0, 1));
    } else if (action === "stop") {
      listeners[point.role]({ type: "end" });
    } else if (action === "close") {
      peer.close();
    } else if (action === "send" && invocation !== undefined) {
      notify(point.role, point.id, invocation, "progress", { text: "Reentrant progress.", id });
      notify(point.role, point.id, invocation, "log", `Reentrant diagnostic ${id}.`);
    } else if (action === "repeat") {
      const second = `injected-${++nextOperation}`;
      const [first, last] = fixture.repeat(point.role, [
        referenceIdentity(id),
        referenceIdentity(second),
      ]);
      observe(id, first as Promise<JsonValue>);
      observe(second, last as Promise<JsonValue>);
    } else {
      const identity = {
        ...referenceIdentity(id),
        parentInvocationId: action === "nested" ? point.id : null,
      };
      observe(id, fixture.request(point.role, identity, action === "dispose"));
    }
  }
  function callback(role: Role, name: string, id: string): void {
    if (!isTesting) {
      return;
    }
    const point = { role, name, id };
    const index = points.length;
    points.push(point);
    if (injection?.point !== index || didInject) {
      return;
    }
    didInject = true;
    const invocation = contexts.get(`${role}:${id}`);
    function apply(): void {
      for (const action of injection?.actions ?? []) {
        try {
          inject(point, action, invocation);
        } catch {
          // Synchronous denials have the same peer outcome as queued denials.
        }
      }
    }
    if (injection.isDeferred) {
      queueMicrotask(apply);
    } else {
      apply();
    }
  }
  function respond(
    role: Role,
    id: string,
    invocation: InvocationContext,
    output: JsonValue,
    failure?: string,
  ): JsonValue | Promise<JsonValue> {
    const key = `${role}:${id}`;
    function settle(): JsonValue {
      let message = failure;
      if (scenario === "throw") {
        notify(role, id, invocation, "progress", { step: id });
        notify(role, id, invocation, "log", `The ${id} handler fails after notifications.`);
        message = `The ${id} handler fails.`;
      }
      if (message !== undefined) {
        const error = new Error(message);
        handlerOutcomes.set(key, { message });
        if (handlerKind === "sync") {
          queueMicrotask(() => {
            error.message = "The thrown failure changes after the throw.";
          });
        }
        throw error;
      }
      handlerOutcomes.set(key, { output: roundTripJson(output) });
      if (handlerKind === "sync") {
        queueMicrotask(() => fixture.mutate(output));
      }
      return output;
    }
    async function settleAsynchronously(): Promise<JsonValue> {
      return settle();
    }
    return handlerKind === "sync" ? settle() : settleAsynchronously();
  }
  for (const role of roles) {
    peers[role] = createProtocolPeer({
      ...referencePeerOptions,
      role,
      transport: fixture.transport(role, {
        ...(role === "broker" ? { terminate: () => callback(role, "terminate", "outer") } : {}),
        close(): void {
          callback(role, "close", "outer");
        },
        send(_frame, id): void {
          callback(role, "send", id);
        },
      }),
      record(entry): void {
        records.push({ role, entry });
        callback(role, `record:${entry.kind}:${entry.direction}`, entry.invocationId ?? "outer");
      },
      authorize(request): void {
        requests.push(request);
        callback(role, "authorize", request.params.identity.invocationId);
      },
      handlers: {
        dispose(request, invocation): JsonValue | Promise<JsonValue> {
          const id = request.params.identity.invocationId;
          callback(role, "handler:dispose", id);
          return respond(role, id, invocation, { disposed: true, activitiesEnded: true });
        },
        "state.read"(request, invocation): JsonValue | Promise<JsonValue> {
          const id = request.params.identity.invocationId;
          contexts.set(`${role}:${id}`, invocation);
          callback(role, "handler:state.read", id);
          return respond(role, id, invocation, { value: "fixture", revision: "captured-1" });
        },
        "tool.execute"(request, invocation): JsonValue | Promise<JsonValue> {
          const id = request.params.identity.invocationId;
          contexts.set(`${role}:${id}`, invocation);
          invocation.signal.addEventListener("abort", () => callback(role, "abort", id), {
            once: true,
          });
          callback(role, "handler:tool.execute", id);
          const output = {
            content: [],
            structuredData: id,
            historicalDetails: null,
            isError: false,
          };
          if (scenario === "waiting" && id === "outer") {
            return new Promise<JsonValue>((resolve) => {
              invocation.signal.addEventListener(
                "abort",
                () => {
                  handlerOutcomes.set(`${role}:${id}`, { output: roundTripJson(output) });
                  resolve(output);
                },
                { once: true },
              );
            });
          }
          return respond(
            role,
            id,
            invocation,
            output,
            scenario === "reject" && id === "outer" ? "The generated handler fails." : undefined,
          );
        },
      },
    });
  }
  function cleanup(): void {
    isTesting = false;
    fixture.close();
  }
  registerTestCleanup(context, cleanup);
  try {
    observe(
      "initialize",
      fixture.call("broker", "initialize", referenceIdentity("initialize"), referenceOffer(), []),
    );
    await fixture.drain(context);
    observe(
      "outer",
      fixture.call(
        "broker",
        "tool.execute",
        referenceIdentity("outer"),
        {
          definition: roundTripJson(referenceTool),
          arguments: { mode: "echo", value: "outer" },
          handles: [],
        },
        ["fixture.read"],
      ),
    );
    await setImmediate();
    if ((scenario === "cancel" || scenario === "waiting") && !peers.broker.isStopped()) {
      try {
        peers.broker.cancel("outer", "Generated cancellation.", Date.UTC(2040, 0, 1));
      } catch {
        // Earlier injected operations can deny the outer invocation's admission.
      }
    }
    await fixture.drain(context);
    observe(
      "read",
      fixture.call(
        "component",
        "state.read",
        referenceIdentity("read"),
        { handle: "fixture.read", key: "sample" },
        ["fixture.read"],
      ),
    );
    await fixture.drain(context);
    if (scenario === "dispose") {
      observe(
        "dispose",
        fixture.call(
          "broker",
          "dispose",
          referenceIdentity("dispose"),
          { reason: "Generated disposal." },
          [],
        ),
      );
    }
    if (scenario === "stop") {
      peers.broker.close();
      peers.component.close();
    }
    await fixture.drain(context);
    const label = `${scenario}:${handlerKind}:${kind}:${JSON.stringify(injection)}`;
    expect(didInject, label).toBe(injection !== undefined);
    const sequences = new Map<string, number>();
    const evidence = new Map<string, number>();
    for (const { role, entry } of records) {
      const key = `${role}:${entry.invocationId}`;
      expect(entry.sequence, label).toBe((evidence.get(key) ?? 0) + 1);
      evidence.set(key, entry.sequence);
      if (entry.kind !== "frame") {
        continue;
      }
      const frame = entry.value as unknown as ProtocolFrame;
      if ("method" in frame && "id" in frame) {
        requests.push(frame);
      }
      if (entry.direction !== "sent" || entry.invocationId === null) {
        continue;
      }
      const details = "params" in frame ? frame.params : (frame.result ?? frame.error?.data);
      expect(details?.sequence, label).toBe((sequences.get(key) ?? 0) + 1);
      sequences.set(key, details?.sequence ?? 0);
    }
    for (const request of requests) {
      const { identity, input, capabilities } = request.params;
      expect(fixture.calls.get(identity.invocationId), label).toEqual({
        identity,
        input,
        capabilities,
      });
    }
    for (const key of new Set([...notifications.keys(), ...handlerOutcomes.keys()])) {
      const sent = records
        .filter(
          ({ role, entry }) =>
            `${role}:${entry.invocationId}` === key &&
            entry.kind === "frame" &&
            entry.direction === "sent",
        )
        .map(({ entry }) => entry.value as unknown as ProtocolFrame);
      const terminalIndex = sent.findIndex((frame) => !("method" in frame));
      const notified = sent.flatMap((frame) =>
        "params" in frame && !("id" in frame) && frame.method !== "cancel"
          ? [{ method: frame.method, data: frame.params.data }]
          : [],
      );
      const called = notifications.get(key) ?? [];
      expect(notified, `${label}:${key}`).toEqual(
        called.slice(0, notified.length).map(({ method, data }) => ({ method, data })),
      );
      expect(
        sent
          .slice(terminalIndex === -1 ? sent.length : terminalIndex + 1)
          .filter((frame) => "method" in frame && frame.method !== "cancel"),
        `${label}:${key}`,
      ).toEqual([]);
      const terminal = sent[terminalIndex] as ResponseFrame | undefined;
      const outcome = handlerOutcomes.get(key);
      if (terminal === undefined || outcome === undefined) {
        continue;
      }
      const isOwnOutcome =
        terminal.result !== undefined || terminal.error?.data.kind === "execution-failure";
      if (terminal.result !== undefined) {
        expect(terminal.result.output, `${label}:${key}`).toEqual(outcome.output);
      } else if (isOwnOutcome) {
        expect(terminal.error?.message, `${label}:${key}`).toBe(outcome.message);
      }
      if (isOwnOutcome) {
        expect(notified.length, `${label}:${key}`).toBeGreaterThanOrEqual(
          called.filter((call) => call.isBeforeOutcome).length,
        );
      }
    }
    return {
      points,
      result: roundTripJson({
        records,
        operations,
        outcomes: outcomes.sort((left, right) => left.name.localeCompare(right.name)),
        stopped: roles.map((role) => peers[role].isStopped()),
      }),
    };
  } finally {
    cleanup();
  }
}

function callbackRange(
  points: CallbackPoint[],
  batch: number,
  batches: number,
): { first: number; end: number } {
  return {
    first: Math.floor((points.length * batch) / batches),
    end: Math.floor((points.length * (batch + 1)) / batches),
  };
}

test.for(
  scenarios.flatMap((scenario) =>
    actions.flatMap((operations, alphabet) =>
      [0, 1].map((batch) => ({ scenario, operations, alphabet, batch })),
    ),
  ),
)(
  "generated $scenario callbacks preserve post-step equivalence for alphabet $alphabet in batch $batch",
  async ({ scenario, operations, alphabet, batch }, context) => {
    const baseline = await runReentryTrace(context, "in-process", scenario);
    const { first, end } = callbackRange(baseline.points, batch, 2);
    process.stdout.write(
      `Re-entry seed: ${seed}. Scenario: ${scenario}. Alphabet: ${alphabet}. Callback range: [${first}, ${end}).\n`,
    );
    for (let point = first; point < end; point++) {
      const callback = baseline.points[point] as CallbackPoint;
      const label = `${scenario}:${JSON.stringify(callback)}:${operations.join(",")}`;
      const injection = { point, actions: operations, isDeferred: false };
      const immediate = await runReentryTrace(context, "in-process", scenario, injection);
      const deferred = await runReentryTrace(context, "in-process", scenario, {
        ...injection,
        isDeferred: true,
      });
      const stream = await runReentryTrace(context, "standard-streams", scenario, injection);
      const deferredStream = await runReentryTrace(context, "standard-streams", scenario, {
        ...injection,
        isDeferred: true,
      });
      expect(immediate.result, label).toEqual(deferred.result);
      expect(stream.result, label).toEqual(immediate.result);
      expect(deferredStream.result, label).toEqual(immediate.result);
    }
  },
);

test.for(
  actions.flatMap((operations, alphabet) =>
    [0, 1, 2, 3, 4, 5].map((batch) => ({ operations, alphabet, batch })),
  ),
)(
  "generated synchronous throws after notifications match asynchronous throws for alphabet $alphabet in batch $batch",
  async ({ operations, alphabet, batch }, context) => {
    const baseline = await runReentryTrace(context, "in-process", "throw");
    const { first, end } = callbackRange(baseline.points, batch, 6);
    process.stdout.write(
      `Re-entry seed: ${seed}. Scenario: throw. Alphabet: ${alphabet}. Callback range: [${first}, ${end}). Handlers: sync, async.\n`,
    );
    for (let point = first; point < end; point++) {
      const callback = baseline.points[point] as CallbackPoint;
      for (const isDeferred of [false, true]) {
        const label = `throw:${JSON.stringify(callback)}:${operations.join(",")}:${isDeferred}`;
        const injection = { point, actions: operations, isDeferred };
        const sync = await runReentryTrace(context, "in-process", "throw", injection);
        const asynchronous = await runReentryTrace(
          context,
          "in-process",
          "throw",
          injection,
          "async",
        );
        const stream = await runReentryTrace(context, "standard-streams", "throw", injection);
        const asynchronousStream = await runReentryTrace(
          context,
          "standard-streams",
          "throw",
          injection,
          "async",
        );
        expect(asynchronous.result, label).toEqual(sync.result);
        expect(stream.result, label).toEqual(sync.result);
        expect(asynchronousStream.result, label).toEqual(sync.result);
      }
    }
  },
);

test("real child terminal evidence cancellation preserves other work and correlation", async (context) => {
  const records: EvidenceRecord[] = [];
  const transport = createWorkerTransport(context, new URL("./reentry-worker.ts", import.meta.url));
  const broker = createProtocolPeer({
    transport,
    role: "broker",
    binding: referenceBinding,
    contracts: referenceContracts,
    capabilities: ["fixture.read"],
    record: (entry) => records.push(entry),
    authorize(): void {},
    handlers: {},
  });
  registerTestCleanup(context, () => broker.close());
  await broker.request("initialize", referenceIdentity("initialize"), referenceOffer());
  function execute(id: string): Promise<JsonValue> {
    return broker.request("tool.execute", referenceIdentity(id), {
      definition: referenceTool,
      arguments: { mode: "echo", value: id },
      handles: [],
    });
  }
  const values = await Promise.all([execute("outer"), execute("other")]);
  expect(values).toMatchObject([{ structuredData: "outer" }, { structuredData: "other" }]);
  await waitFor(() =>
    expect(records.some((entry) => entry.kind === "late" && entry.invocationId === "outer")).toBe(
      true,
    ),
  );
  expect(broker.isStopped()).toBe(false);
  expect(await execute("after")).toMatchObject({ structuredData: "after" });
  const frames = records
    .filter(
      (entry) =>
        entry.kind === "frame" && entry.direction === "received" && entry.invocationId === "outer",
    )
    .map((entry) => entry.value as unknown as ProtocolFrame);
  expect(
    frames.map((frame) => ("params" in frame ? frame.params.sequence : frame.result?.sequence)),
  ).toEqual([1, 2]);
});

test("real child receives call-time arguments and notifications before a synchronous throw", async (context) => {
  const records: EvidenceRecord[] = [];
  const repeated: Promise<JsonValue>[] = [];
  const transport = createWorkerTransport(context, new URL("./reentry-worker.ts", import.meta.url));
  let broker: ProtocolPeer | undefined;
  function execute(id: string, mode: string, value: JsonValue): Promise<JsonValue> {
    return (broker as ProtocolPeer).request("tool.execute", referenceIdentity(id), {
      definition: referenceTool,
      arguments: { mode, value },
      handles: [],
    });
  }
  broker = createProtocolPeer({
    transport,
    role: "broker",
    binding: referenceBinding,
    contracts: referenceContracts,
    capabilities: ["fixture.read"],
    record(entry): void {
      records.push(entry);
      const frame = entry.value as unknown as ProtocolFrame;
      if (entry.invocationId === "trigger" && entry.direction === "received" && "id" in frame) {
        const input = {
          definition: referenceTool,
          arguments: { mode: "echo", value: "first" },
          handles: [],
        };
        repeated.push(
          (broker as ProtocolPeer).request("tool.execute", referenceIdentity("first"), input),
        );
        input.arguments.value = "second";
        repeated.push(
          (broker as ProtocolPeer).request("tool.execute", referenceIdentity("second"), input),
        );
        input.arguments.value = "mutated";
      }
    },
    authorize(): void {},
    handlers: {},
  });
  registerTestCleanup(context, () => broker?.close());
  await broker.request("initialize", referenceIdentity("initialize"), referenceOffer());
  await execute("trigger", "echo", "trigger");
  expect(await Promise.all(repeated)).toMatchObject([
    { structuredData: "first" },
    { structuredData: "second" },
  ]);
  await expect(execute("throw", "throw", "notified")).rejects.toThrow(
    "The worker fails synchronously.",
  );
  const frames = records
    .filter(
      (entry) =>
        entry.kind === "frame" && entry.direction === "received" && entry.invocationId === "throw",
    )
    .map((entry) => entry.value as unknown as ProtocolFrame);
  expect(
    frames.map((frame) =>
      "params" in frame
        ? [frame.method, frame.params.sequence, "data" in frame.params ? frame.params.data : null]
        : ["terminal", frame.error?.data.sequence, frame.error?.message],
    ),
  ).toEqual([
    ["progress", 1, { value: { value: "notified" } }],
    ["log", 2, { level: "info", message: "The worker fails after notifications." }],
    ["terminal", 3, "The worker fails synchronously."],
  ]);
});
