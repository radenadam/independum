import { PassThrough } from "node:stream";
import { setImmediate } from "node:timers/promises";
import { expect, type TestContext, test } from "vitest";
import {
  createProtocolPeer,
  type EvidenceRecord,
  type InvocationContext,
  type ProtocolPeer,
} from "./create-protocol-peer.ts";
import {
  referenceBinding,
  referenceContracts,
  referenceIdentity,
  referenceOffer,
  referenceTool,
} from "./reference-component.ts";
import { registerTestCleanup } from "./register-test-cleanup.ts";
import { type JsonValue, type ProtocolFrame, type RequestFrame, roundTripJson } from "./schemas.ts";
import {
  createInProcessTransports,
  createStreamTransport,
  type ProtocolTransport,
  type TransportEvent,
} from "./transports.ts";

type Role = "broker" | "component";
type BoundaryAction = "throw" | "close" | "stop" | "cancel";
type BoundaryEvent =
  | { type: "record"; index: number; action: BoundaryAction }
  | { type: "authorize"; role: Role; action: Exclude<BoundaryAction, "throw"> }
  | { type: "before-handler"; action: "close" | "stop" };
type Scenario =
  | "initialize"
  | "dispose"
  | "invalid-frame"
  | "invalid-request"
  | "complete"
  | "cancel"
  | "reject"
  | "encoding"
  | "fault"
  | "end"
  | "exit"
  | "diagnostic"
  | "late"
  | "send-failure";
const scenarios: Scenario[] = [
  "initialize",
  "dispose",
  "invalid-frame",
  "invalid-request",
  "complete",
  "cancel",
  "reject",
  "encoding",
  "fault",
  "end",
  "exit",
  "diagnostic",
  "late",
  "send-failure",
];
const roles: Role[] = ["broker", "component"];
const seed = 0x51a7e203;

async function runBoundaryTrace(
  context: TestContext,
  kind: ProtocolTransport["kind"],
  scenario: Scenario,
  boundary?: BoundaryEvent,
): Promise<{ records: EvidenceRecord[]; result: JsonValue; didInject: boolean }> {
  context.signal.throwIfAborted();
  let pair: [ProtocolTransport, ProtocolTransport];
  if (kind === "in-process") {
    pair = createInProcessTransports();
  } else {
    const left = new PassThrough();
    const right = new PassThrough();
    pair = [
      createStreamTransport({ input: left, output: right }),
      createStreamTransport({ input: right, output: left }),
    ];
  }
  const peers = {} as Record<Role, ProtocolPeer>;
  const listeners = {} as Record<Role, (event: TransportEvent) => void>;
  const stopped = new Set<Role>();
  const revoked = new Set<string>();
  const settled = new Set<string>();
  const parents = new Map<string, string>();
  const records: EvidenceRecord[] = [];
  const starts: string[] = [];
  const violations: string[] = [];
  const outcomes: JsonValue[] = [];
  const pending: { role: Role; frame: ProtocolFrame }[] = [];
  const delivered: ProtocolFrame[] = [];
  let retained: { request: RequestFrame; context: InvocationContext } | undefined;
  let recordIndex = 0;
  let didInject = false;
  let isTesting = false;
  let doesSendFail = false;
  const label = `${kind}, ${scenario}, ${JSON.stringify(boundary)}.`;

  function start(role: Role, action: string, id: string, isControl = false): void {
    const key = `${role}:${id}`;
    let ancestor: string | undefined = key;
    let isRevoked = false;
    while (ancestor !== undefined) {
      isRevoked ||= revoked.has(ancestor) || settled.has(ancestor);
      ancestor = parents.get(ancestor);
    }
    if (
      stopped.has(role) ||
      peers[role].isStopped() ||
      (!isControl && isRevoked) ||
      (action === "terminal-send" && settled.has(key))
    ) {
      violations.push(`${key}:${action}`);
    }
    starts.push(`${key}:${action}`);
  }
  function interrupt(role: Role, action: BoundaryAction, id: string): void {
    didInject = true;
    if (action === "cancel") {
      revoked.add(`${role}:${id}`);
      peers[role].cancel(id, "Generated boundary cancellation.", Date.UTC(2040, 0, 1));
    } else {
      stopped.add(role);
      if (action === "throw") {
        throw new Error("The generated evidence sink fails.");
      }
      if (action === "close") {
        peers[role].close();
      } else {
        listeners[role]({ type: "end" });
      }
    }
  }
  function observe(promise: Promise<JsonValue>): void {
    void promise.then(
      (value) => outcomes.push(value),
      (error: unknown) =>
        outcomes.push({ error: error instanceof Error ? error.message : "Unknown failure." }),
    );
  }
  function nested(role: Role, request: RequestFrame, suffix: string): Promise<JsonValue> {
    return peers[role].request(
      "state.read",
      {
        ...request.params.identity,
        invocationId: `${request.params.identity.invocationId}.${suffix}`,
        parentInvocationId: request.params.identity.invocationId,
      },
      { handle: "fixture.read", key: "sample" },
      ["fixture.read"],
    );
  }
  for (const [index, role] of roles.entries()) {
    const transport = pair[index] as ProtocolTransport;
    peers[role] = createProtocolPeer({
      role,
      binding: referenceBinding,
      contracts: referenceContracts,
      capabilities: ["fixture.read"],
      transport: {
        ...transport,
        listen(listener): void {
          listeners[role] = listener;
          transport.listen(listener);
        },
        // The scheduler owns lifecycle events and teardown owns physical channels.
        close(): void {},
        send(value): void {
          const frame = value as ProtocolFrame;
          const details = "params" in frame ? frame.params : (frame.result ?? frame.error?.data);
          const id = details?.identity?.invocationId ?? "uncorrelated";
          const isControl = !("method" in frame) || frame.method === "cancel";
          start(role, "method" in frame ? "send" : "terminal-send", id, isControl);
          if (!("method" in frame)) {
            settled.add(`${role}:${id}`);
          }
          if (doesSendFail) {
            stopped.add(role);
            throw new Error("The generated transport send fails.");
          }
          pending.push({ role, frame });
        },
      },
      record(entry): void {
        if (entry.kind === "frame") {
          const frame = entry.value as unknown as ProtocolFrame;
          if (
            "method" in frame &&
            "id" in frame &&
            frame.params.identity.parentInvocationId !== null
          ) {
            parents.set(
              `${role}:${frame.params.identity.invocationId}`,
              `${role}:${frame.params.identity.parentInvocationId}`,
            );
          }
        }
        if (isTesting) {
          const index = recordIndex++;
          if (boundary?.type === "record" && boundary.index === index && !didInject) {
            interrupt(role, boundary.action, entry.invocationId ?? "unknown");
          }
          records.push(entry);
        }
        if (entry.kind === "frame" && entry.direction === "received") {
          const frame = entry.value as unknown as ProtocolFrame;
          if (!("method" in frame) && entry.invocationId !== null) {
            settled.add(`${role}:${entry.invocationId}`);
          }
          if ("method" in frame && frame.method === "cancel") {
            revoked.add(`${role}:${frame.params.identity.invocationId}`);
          }
        }
      },
      authorize(request): void {
        if (!isTesting) {
          return;
        }
        if (
          boundary?.type === "authorize" &&
          boundary.role === role &&
          request.method === "tool.execute" &&
          !didInject
        ) {
          interrupt(role, boundary.action, request.params.identity.invocationId);
        }
        if (role === "component" && request.method === "tool.execute") {
          observe(nested(role, request, "authorization"));
          if (boundary?.type === "before-handler" && !didInject) {
            interrupt(role, boundary.action, request.params.identity.invocationId);
          }
        }
      },
      handlers: {
        dispose(): JsonValue {
          return { disposed: true, activitiesEnded: true };
        },
        "state.read"(request, invocation): JsonValue {
          start(role, "handler", request.params.identity.invocationId);
          invocation.assertCapability("fixture.read");
          start(role, "effect", request.params.identity.invocationId);
          return { value: "fixture", revision: "captured-1" };
        },
        "effect.request"(request, invocation): JsonValue {
          start(role, "handler", request.params.identity.invocationId);
          invocation.assertCapability("fixture.read");
          start(role, "effect", request.params.identity.invocationId);
          return { value: "fixture", records: [] };
        },
        async "tool.execute"(request, invocation): Promise<JsonValue> {
          const id = request.params.identity.invocationId;
          start(role, "handler", id);
          retained = { request, context: invocation };
          try {
            invocation.log("info", "Generated diagnostic.");
            invocation.progress({ step: 1 });
          } catch {
            // Stale code deliberately attempts further work after notification failure.
          }
          try {
            invocation.assertCapability("fixture.read");
            start(role, "effect", id);
          } catch {
            // Revocation must prevent the simulated effect from starting.
          }
          try {
            await nested(role, request, "handler");
          } catch {
            // A rejected nested call must not grant authority to a later effect request.
          }
          await peers[role].request(
            "effect.request",
            {
              ...request.params.identity,
              invocationId: `${id}.effect`,
              parentInvocationId: id,
            },
            {
              permissionHandle: "fixture.read",
              executionHandle: "fixture.read",
              effect: "fixture",
              arguments: {},
              approvalId: null,
            },
            ["fixture.read"],
          );
          return scenario === "encoding"
            ? { oversized: "x".repeat(1024 * 1024) }
            : {
                content: [],
                structuredData: "fixture",
                historicalDetails: null,
                isError: false,
              };
        },
      },
    });
  }
  function cleanup(): void {
    peers.broker.close();
    peers.component.close();
    for (const transport of pair) {
      transport.close();
    }
  }
  registerTestCleanup(context, cleanup);
  async function drain(): Promise<void> {
    for (let step = 0; step < 100; step++) {
      context.signal.throwIfAborted();
      const delivery = pending.shift();
      if (delivery !== undefined) {
        delivered.push(delivery.frame);
        const index = delivery.role === "broker" ? 0 : 1;
        pair[index].send(delivery.frame);
      }
      await setImmediate();
      if (pending.length === 0) {
        return;
      }
    }
    throw new Error("The generated boundary trace does not quiesce.");
  }
  try {
    isTesting = scenario === "initialize";
    observe(peers.broker.request("initialize", referenceIdentity("initialize"), referenceOffer()));
    await drain();
    outcomes.length = 0;
    starts.length = 0;
    isTesting = true;
    observe(
      peers.broker.request(
        "tool.execute",
        referenceIdentity("outer"),
        {
          definition: referenceTool,
          arguments: { mode: "echo", value: "fixture" },
          handles: [],
        },
        ["fixture.read"],
      ),
    );
    if (scenario === "cancel" && !peers.broker.isStopped()) {
      revoked.add("broker:outer");
      try {
        peers.broker.cancel("outer", "Generated cancellation.", Date.UTC(2040, 0, 1));
      } catch {
        // The generated sink failure may reject cancellation delivery.
      }
    }
    doesSendFail = scenario === "send-failure";
    await drain();
    if (scenario === "reject") {
      observe(
        peers.broker.request(
          "state.read",
          referenceIdentity("denied"),
          { handle: "ungranted", key: "sample" },
          ["ungranted"],
        ),
      );
    } else if (scenario === "dispose") {
      observe(
        peers.broker.request("dispose", referenceIdentity("dispose"), {
          reason: "Generated disposal.",
        }),
      );
    } else if (scenario === "invalid-frame") {
      listeners.broker({
        type: "message",
        value: { jsonrpc: "2.0", method: "unknown", id: "invalid" },
      });
    } else if (scenario === "invalid-request") {
      listeners.component({
        type: "message",
        value: {
          jsonrpc: "2.0",
          method: "tool.execute",
          id: "invalid-request",
          params: {
            wireVersion: { major: 1, minor: 0 },
            identity: referenceIdentity("invalid-request"),
            contract: { id: "tool.execute", version: { major: 1, minor: 0 } },
            sequence: 1,
            capabilities: [],
            input: {},
          },
        },
      });
    } else if (scenario === "late" && retained !== undefined) {
      for (const operation of [
        () => retained?.context.progress("late"),
        () => retained?.context.assertCapability("fixture.read"),
      ]) {
        try {
          operation();
          start("component", "retained-context", retained.request.params.identity.invocationId);
        } catch {
          // Retained contexts must reject work after settlement.
        }
      }
      observe(nested("component", retained.request, "late"));
      const terminal = delivered.find(
        (frame) =>
          !("method" in frame) &&
          (frame.result ?? frame.error?.data)?.identity?.invocationId === "outer",
      );
      if (terminal !== undefined) {
        listeners.broker({ type: "message", value: terminal });
      }
    } else if (
      scenario !== "complete" &&
      scenario !== "initialize" &&
      scenario !== "cancel" &&
      scenario !== "encoding" &&
      scenario !== "send-failure"
    ) {
      const event: TransportEvent =
        scenario === "fault"
          ? { type: "fault", reason: "Generated malformed bytes.", bytes: "/w==" }
          : scenario === "exit"
            ? { type: "exit", code: 23, signal: null }
            : scenario === "diagnostic"
              ? { type: "diagnostic", text: "Generated worker diagnostic." }
              : { type: "end" };
      if (scenario === "end" || scenario === "exit") {
        stopped.add("broker");
      }
      listeners.broker(event);
    }
    await drain();
    expect(violations, label).toEqual([]);
    return {
      records: [...records],
      didInject,
      result: roundTripJson({
        records,
        starts,
        outcomes,
        stopped: roles.map((role) => peers[role].isStopped()),
      }),
    };
  } finally {
    isTesting = false;
    cleanup();
  }
}

test.for(scenarios)(
  "generated %s boundaries preserve action admission over both transports",
  async (scenario, context) => {
    process.stdout.write(
      `Admission seed: ${seed}. Scenario: ${scenario}. Transports: in-process, standard-streams.\n`,
    );
    const baseline = await runBoundaryTrace(context, "in-process", scenario);
    const baselineStream = await runBoundaryTrace(context, "standard-streams", scenario);
    expect(baselineStream.result).toEqual(baseline.result);
    const boundaries: BoundaryEvent[] = [
      ...baseline.records.flatMap((_, index): BoundaryEvent[] =>
        ["throw", "close", "stop"].map((action) => ({
          type: "record",
          index,
          action: action as BoundaryAction,
        })),
      ),
      ...roles.flatMap((role): BoundaryEvent[] =>
        ["close", "stop", "cancel"].map((action) => ({
          type: "authorize",
          role,
          action: action as "close" | "stop" | "cancel",
        })),
      ),
      { type: "before-handler", action: "close" },
      { type: "before-handler", action: "stop" },
    ];
    const offset = seed % boundaries.length;
    process.stdout.write(
      `Admission boundaries: ${boundaries.length}. Recording points: ${baseline.records.length}.\n`,
    );
    for (let step = 0; step < boundaries.length; step++) {
      const boundary = boundaries[(step + offset) % boundaries.length] as BoundaryEvent;
      const left = await runBoundaryTrace(context, "in-process", scenario, boundary);
      const right = await runBoundaryTrace(context, "standard-streams", scenario, boundary);
      expect(left.didInject, JSON.stringify(boundary)).toBe(true);
      expect(right.didInject, JSON.stringify(boundary)).toBe(true);
      expect(right.result, JSON.stringify(boundary)).toEqual(left.result);
    }
  },
);

test("nested evidence failure during authorization blocks the outer handler", async (context) => {
  const baseline = await runBoundaryTrace(context, "in-process", "complete");
  const index = baseline.records.findIndex(
    (entry) => entry.direction === "sent" && entry.invocationId === "outer.authorization",
  );
  expect(index).toBeGreaterThanOrEqual(0);
  const boundary: BoundaryEvent = { type: "record", index, action: "throw" };
  const left = await runBoundaryTrace(context, "in-process", "complete", boundary);
  const right = await runBoundaryTrace(context, "standard-streams", "complete", boundary);
  expect(left.didInject && right.didInject).toBe(true);
  expect(right.result).toEqual(left.result);
});
