import { setImmediate } from "node:timers/promises";
import { expect, type TestContext, test } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { createPeerFixture } from "./create-peer-fixture.ts";
import {
  createProtocolPeer,
  type EvidenceRecord,
  type InvocationContext,
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
import { type JsonValue, type ProtocolFrame, roundTripJson } from "./schemas.ts";
import type { ProtocolTransport } from "./transports.ts";

type Role = "broker" | "component";
type Action = "cancel" | "send" | "stop" | "close" | "dispose" | "nested";
type Scenario = "complete" | "reject" | "cancel" | "waiting" | "dispose" | "stop";
interface CallbackPoint {
  role: Role;
  name: string;
  id: string;
}
const actions: Action[][] = [
  ["cancel"],
  ["send"],
  ["stop"],
  ["close"],
  ["dispose"],
  ["nested"],
  ["send", "cancel", "nested", "dispose", "stop", "close"],
  ["nested", "dispose", "send", "cancel", "close", "stop"],
];
const scenarios: Scenario[] = ["complete", "reject", "cancel", "waiting", "dispose", "stop"];
const seed = 0x51a7e205;

async function runReentryTrace(
  context: TestContext,
  kind: ProtocolTransport["kind"],
  scenario: Scenario,
  injection?: { point: number; actions: Action[]; isDeferred: boolean },
): Promise<{ points: CallbackPoint[]; result: JsonValue }> {
  context.signal.throwIfAborted();
  const fixture = createPeerFixture(kind);
  const { peers, listeners } = fixture;
  const contexts = new Map<string, InvocationContext>();
  const points: CallbackPoint[] = [];
  const records: { role: Role; entry: EvidenceRecord }[] = [];
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
      invocation.progress("Reentrant progress.");
      invocation.log("info", "Reentrant diagnostic.");
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
        callback(role, "authorize", request.params.identity.invocationId);
      },
      handlers: {
        dispose(request): JsonValue {
          callback(role, "handler:dispose", request.params.identity.invocationId);
          return { disposed: true, activitiesEnded: true };
        },
        "state.read"(request, invocation): JsonValue {
          const id = request.params.identity.invocationId;
          contexts.set(`${role}:${id}`, invocation);
          callback(role, "handler:state.read", id);
          return { value: "fixture", revision: "captured-1" };
        },
        "tool.execute"(request, invocation): JsonValue | Promise<JsonValue> {
          const id = request.params.identity.invocationId;
          contexts.set(`${role}:${id}`, invocation);
          invocation.signal.addEventListener("abort", () => callback(role, "abort", id), {
            once: true,
          });
          callback(role, "handler:tool.execute", id);
          if (scenario === "reject" && id === "outer") {
            throw new Error("The generated handler fails.");
          }
          const output = {
            content: [],
            structuredData: id,
            historicalDetails: null,
            isError: false,
          };
          if (scenario === "waiting" && id === "outer") {
            return new Promise<JsonValue>((resolve) => {
              invocation.signal.addEventListener("abort", () => resolve(output), { once: true });
            });
          }
          return output;
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
      peers.broker.request("initialize", referenceIdentity("initialize"), referenceOffer()),
    );
    await fixture.drain(context);
    observe(
      "outer",
      peers.broker.request(
        "tool.execute",
        referenceIdentity("outer"),
        { definition: referenceTool, arguments: { mode: "echo", value: "outer" }, handles: [] },
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
      peers.component.request(
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
        peers.broker.request("dispose", referenceIdentity("dispose"), {
          reason: "Generated disposal.",
        }),
      );
    }
    if (scenario === "stop") {
      peers.broker.close();
      peers.component.close();
    }
    await fixture.drain(context);
    expect(didInject).toBe(injection !== undefined);
    const sequences = new Map<string, number>();
    const evidence = new Map<string, number>();
    for (const { role, entry } of records) {
      const key = `${role}:${entry.invocationId}`;
      expect(entry.sequence).toBe((evidence.get(key) ?? 0) + 1);
      evidence.set(key, entry.sequence);
      if (entry.kind !== "frame" || entry.direction !== "sent" || entry.invocationId === null) {
        continue;
      }
      const frame = entry.value as unknown as ProtocolFrame;
      const details = "params" in frame ? frame.params : (frame.result ?? frame.error?.data);
      expect(details?.sequence, `${key}:${JSON.stringify(injection)}`).toBe(
        (sequences.get(key) ?? 0) + 1,
      );
      sequences.set(key, details?.sequence ?? 0);
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
    const first = Math.floor((baseline.points.length * batch) / 2);
    const end = Math.floor((baseline.points.length * (batch + 1)) / 2);
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
