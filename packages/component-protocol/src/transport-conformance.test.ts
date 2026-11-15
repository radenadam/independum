import { expect, type TestContext, test } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { createMisbehavingComponent } from "./create-misbehaving-component.ts";
import {
  createProtocolPeer,
  type EvidenceRecord,
  ProtocolError,
  type ProtocolPeer,
} from "./create-protocol-peer.ts";
import { createWorkerTransport } from "./create-worker-transport.ts";
import {
  createReferenceComponent,
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
  maximumFrameBytes,
  type Operation,
  type ProtocolFrame,
  type RequestFrame,
  roundTripJson,
} from "./schemas.ts";
import { createInProcessTransports, encodeFrame, type ProtocolTransport } from "./transports.ts";

interface Fixture {
  broker: ProtocolPeer;
  transport: ProtocolTransport;
  evidence: EvidenceRecord[];
  componentEvidence: EvidenceRecord[];
  failEvidence(): void;
  failTerminalEvidence(): void;
  failSend(): void;
}
type ComponentBehavior = boolean | "peer" | "holding-peer";
const kinds = ["in-process", "standard-streams"] as const;
const integerCountSchema: JsonValue = {
  type: "object",
  required: ["count"],
  properties: { count: { type: "integer" } },
};

function createFixture(
  context: TestContext,
  kind: (typeof kinds)[number],
  doesMisbehave: ComponentBehavior = false,
): Fixture {
  context.signal.throwIfAborted();
  let transport: ProtocolTransport;
  let component: ProtocolPeer | undefined;
  let componentTransport: ProtocolTransport | undefined;
  const componentEvidence: EvidenceRecord[] = [];
  if (kind === "in-process") {
    const pair = createInProcessTransports();
    transport = pair[0];
    componentTransport = pair[1];
    if (doesMisbehave) {
      createMisbehavingComponent(pair[1], typeof doesMisbehave === "string");
    } else {
      component = createReferenceComponent(pair[1], (entry) => componentEvidence.push(entry));
    }
  } else {
    transport = createWorkerTransport(
      context,
      doesMisbehave
        ? new URL("./misbehaving-worker.ts", import.meta.url)
        : new URL("./reference-worker.ts", import.meta.url),
      [
        ...(typeof doesMisbehave === "string" ? ["peer"] : []),
        ...(doesMisbehave === "holding-peer" ? ["hold"] : []),
      ],
    );
  }
  const evidence: EvidenceRecord[] = [];
  let doesEvidenceFail = false;
  let doesTerminalEvidenceFail = false;
  let doesSendFail = false;
  const broker = createProtocolPeer({
    transport: {
      ...transport,
      send(value): void {
        if (doesSendFail) {
          throw new Error("The fixture send fails.");
        }
        transport.send(value);
      },
    },
    role: "broker",
    binding: referenceBinding,
    contracts: referenceContracts,
    capabilities: ["fixture.read"],
    record(entry): void {
      if (
        doesEvidenceFail ||
        (doesTerminalEvidenceFail &&
          entry.direction === "received" &&
          entry.kind === "frame" &&
          ("result" in Object(entry.value) || "error" in Object(entry.value)))
      ) {
        throw new Error("The evidence destination is unavailable.");
      }
      evidence.push(entry);
    },
    authorize(request): void {
      if (
        request.method === "state.read" &&
        (request.params.input as { handle: string }).handle !== "fixture.read"
      ) {
        throw new ProtocolError("The state handle is denied.", {
          identity: request.params.identity,
          contract: request.params.contract,
          kind: "denied-authority",
          sequence: 0,
          dispatch: "absent",
          effects: "absent",
          text: null,
          locations: [{ pointer: "/handle", reason: "The state handle is not granted." }],
        });
      }
    },
    handlers: {
      "state.read"(request, invocation): JsonValue {
        invocation.assertCapability("fixture.read");
        return {
          value: { key: (request.params.input as { key: string }).key },
          revision: "recorded-1",
        };
      },
    },
  });
  function close(): void {
    broker.close();
    component?.close();
    componentTransport?.close();
  }
  registerTestCleanup(context, close);
  return {
    broker,
    transport,
    evidence,
    componentEvidence,
    failEvidence(): void {
      doesEvidenceFail = true;
    },
    failTerminalEvidence(): void {
      doesTerminalEvidenceFail = true;
    },
    failSend(): void {
      doesSendFail = true;
    },
  };
}

async function initialize(fixture: Fixture): Promise<JsonValue> {
  return fixture.broker.request("initialize", referenceIdentity("initialize"), referenceOffer());
}
async function initializedFixture(
  context: TestContext,
  kind: (typeof kinds)[number],
  doesMisbehave: ComponentBehavior = false,
): Promise<Fixture> {
  const fixture = createFixture(context, kind, doesMisbehave);
  await initialize(fixture);
  return fixture;
}
async function waitForClosedFixture(fixture: Fixture): Promise<void> {
  expect(fixture.broker.isStopped()).toBe(true);
  expect(() => fixture.transport.send({})).toThrow("closed");
  if (fixture.transport.kind === "standard-streams") {
    await waitForEvidence(fixture, "exit");
  } else if (fixture.componentEvidence.length > 0) {
    await waitFor(() =>
      expect(fixture.componentEvidence.some((entry) => entry.kind === "end")).toBe(true),
    );
  }
}
async function waitForProgress(fixture: Fixture, invocationId: string): Promise<void> {
  await waitFor(() =>
    expect(
      frames(fixture, invocationId).some(
        (frame) => "method" in frame && frame.method === "progress",
      ),
    ).toBe(true),
  );
}
async function waitForEvidence(
  fixture: Fixture,
  kind: EvidenceRecord["kind"],
): Promise<EvidenceRecord> {
  return waitFor(() => {
    const record = fixture.evidence.find((entry) => entry.kind === kind);
    expect(record).toBeDefined();
    return record as EvidenceRecord;
  });
}
async function execute(
  fixture: Fixture,
  invocationId: string,
  mode: string,
  value: JsonValue = null,
): Promise<JsonValue> {
  return fixture.broker.request(
    "tool.execute",
    referenceIdentity(invocationId),
    {
      definition: referenceTool,
      arguments: { mode, value },
      handles: ["fixture.read"],
    },
    ["fixture.read"],
  );
}
function frames(fixture: Fixture, invocationId: string): ProtocolFrame[] {
  return fixture.evidence
    .filter((entry) => entry.kind === "frame" && entry.invocationId === invocationId)
    .map((entry) => entry.value as unknown as ProtocolFrame);
}

test.for(kinds)(
  "%s negotiates before activating contributions and describes without executing",
  async (kind, context) => {
    const fixture = createFixture(context, kind);
    await expect(execute(fixture, "early", "echo")).rejects.toThrow("Initialization");
    expect(await initialize(fixture)).toMatchObject({
      wireVersion: { major: 1, minor: 0 },
      manifestVersion: { major: 1, minor: 0 },
      grantedCapabilities: ["fixture.read"],
    });
    expect(
      await fixture.broker.request("describe", referenceIdentity("describe"), {}),
    ).toMatchObject({ id: "reference" });
    expect(
      await fixture.broker.request("dispose", referenceIdentity("dispose"), {
        reason: "The fixture ends.",
      }),
    ).toEqual({ disposed: true, activitiesEnded: true });
  },
);

test.for(kinds)(
  "%s rejects incompatible wire manifest and contribution majors",
  async (kind, context) => {
    for (const field of ["wireVersions", "manifestVersions", "contracts"] as const) {
      const fixture = createFixture(context, kind);
      const offer = referenceOffer() as Record<string, JsonValue>;
      offer[field] =
        field === "contracts"
          ? { "tool.execute": [{ major: 2, minor: 0 }] }
          : [{ major: 2, minor: 0 }];
      await expect(
        fixture.broker.request("initialize", referenceIdentity(`major-${field}`), offer),
      ).rejects.toThrow("compatible major");
    }
  },
);

test.for(kinds)(
  "%s round trips json and broker-owned blobs with nested correlation and ordered progress",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    const value: JsonValue = {
      text: "\u2603\n",
      nested: [null, false, 1.25],
      blob: {
        id: "large",
        brokerId: "broker",
        digest: `sha256:${"b".repeat(64)}`,
        size: 2_000_000,
        mediaType: "image/png",
        access: ["read"],
        retentionId: "retained",
      },
    };
    expect(await execute(fixture, "echo", "echo", value)).toMatchObject({ structuredData: value });
    expect(await execute(fixture, "nested", "nested")).toMatchObject({
      structuredData: { revision: "recorded-1", value: { key: "sample" } },
    });
    const nested = frames(fixture, "nested.read");
    expect(nested).toHaveLength(2);
    expect(nested[0]).toMatchObject({
      method: "state.read",
      params: { identity: { parentInvocationId: "nested", configurationRevision: "captured-1" } },
    });
    const ordered = frames(fixture, "echo");
    expect(ordered.map((frame) => ("method" in frame ? frame.method : "terminal"))).toEqual([
      "tool.execute",
      "log",
      "progress",
      "terminal",
    ]);
    expect(
      ordered
        .slice(1)
        .map((frame) => ("params" in frame ? frame.params.sequence : frame.result?.sequence)),
    ).toEqual([1, 2, 3]);
    const records = fixture.evidence.filter((entry) => entry.invocationId === "echo");
    expect(records.map((entry) => entry.sequence)).toEqual([1, 2, 3, 4]);
    if (kind === "standard-streams") {
      expect((await waitForEvidence(fixture, "diagnostic")).value).toContain("ready");
    }
  },
);

test.for(kinds)(
  "%s records denied capabilities failed execution and invalid replacements",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    await expect(execute(fixture, "denied", "denied")).rejects.toMatchObject({
      failure: {
        kind: "denied-authority",
        dispatch: "known",
        effects: "uncertain",
        causes: [
          {
            identity: { invocationId: "denied.read", parentInvocationId: "denied" },
            contract: { id: "state.read" },
            locations: [{ pointer: "/handle" }],
            effects: "absent",
          },
        ],
      },
    });
    await expect(execute(fixture, "failure", "failure")).rejects.toMatchObject({
      failure: { kind: "execution-failure" },
    });
    await expect(
      fixture.broker.request("stage.apply", referenceIdentity("replacement"), {
        stage: "tool_call",
        mode: "transform",
        allowedEffects: ["replace"],
        value: { action: "replace", replacement: { count: "2" } },
        replacementSchema: integerCountSchema,
      }),
    ).rejects.toMatchObject({
      failure: { kind: "invalid-input", locations: [{ pointer: "/count" }] },
    });
    await expect(
      fixture.broker.request("stage.apply", referenceIdentity("observation"), {
        stage: "context",
        mode: "observe",
        allowedEffects: [],
        replacementSchema: {},
        value: { action: "replace", replacement: {} },
      }),
    ).rejects.toMatchObject({ failure: { kind: "invalid-input" } });
  },
);

test.for(kinds)(
  "%s revokes cancellation capabilities and keeps settlement separate from worker exit",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    const outcome = execute(fixture, "cancelled", "wait").catch((error: unknown) => error);
    await waitForProgress(fixture, "cancelled");
    fixture.broker.cancel("cancelled", "The fixture requests cancellation.", Date.now() + 250);
    expect(await outcome).toMatchObject({ failure: { kind: "cancellation" } });
    expect(
      frames(fixture, "cancelled").filter((frame) => "result" in frame || "error" in frame),
    ).toHaveLength(1);
    const cancelIndex = fixture.evidence.findIndex(
      (entry) => entry.kind === "frame" && (entry.value as { method?: string }).method === "cancel",
    );
    const terminalIndex = fixture.evidence.findIndex(
      (entry) =>
        entry.invocationId === "cancelled" &&
        (entry.value as { error?: unknown }).error !== undefined,
    );
    expect(terminalIndex).toBeGreaterThan(cancelIndex);
    if (kind === "standard-streams") {
      await waitForEvidence(fixture, "exit");
      expect(fixture.evidence.findIndex((entry) => entry.kind === "exit")).toBeGreaterThan(
        terminalIndex,
      );
    }
  },
);

test.for(kinds)(
  "%s preserves a completed outcome when cancellation loses the race",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    await execute(fixture, "completed", "echo", "completed effect evidence");
    fixture.broker.cancel("completed", "Cancellation arrives after completion.", Date.now() + 1000);
    fixture.broker.cancel(
      "completed",
      "Another late cancellation stays sequenced.",
      Date.now() + 1000,
    );
    expect(
      frames(fixture, "completed")
        .filter((frame) => "method" in frame && frame.method === "cancel")
        .map((frame) => ("params" in frame ? frame.params.sequence : null)),
    ).toEqual([2, 3]);
    expect(
      frames(fixture, "completed").filter((frame) => "result" in frame || "error" in frame),
    ).toHaveLength(1);
  },
);

test.for(kinds)(
  "%s records worker interruption without retrying dispatched work",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    await expect(execute(fixture, "interrupted", "exit")).rejects.toThrow("worker ends");
    expect(fixture.evidence.filter((entry) => entry.kind === "interrupted")).toHaveLength(1);
    expect(
      frames(fixture, "interrupted").filter(
        (frame) => "method" in frame && frame.method === "tool.execute",
      ),
    ).toHaveLength(1);
    if (kind === "standard-streams") {
      await waitFor(() =>
        expect(fixture.evidence.find((entry) => entry.kind === "exit")?.value).toMatchObject({
          code: 23,
        }),
      );
    }
  },
);

test.for(kinds)(
  "%s stops automatic work when evidence cannot be recorded",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    fixture.failEvidence();
    await expect(execute(fixture, "unrecorded", "echo")).rejects.toThrow(
      "Evidence recording fails",
    );
    expect(fixture.broker.isStopped()).toBe(true);
    expect(frames(fixture, "unrecorded")).toEqual([]);
  },
);

test.for(kinds)(
  "%s rejects malformed messages and changed captured identities",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    await expect(
      fixture.broker.request(
        "describe",
        { ...referenceIdentity("impersonated"), configurationRevision: "newer" },
        {},
      ),
    ).rejects.toThrow("configurationRevision");
    const request: RequestFrame = {
      jsonrpc: "2.0",
      id: "malformed",
      method: "tool.execute",
      params: {
        wireVersion: { major: 1, minor: 0 },
        identity: referenceIdentity("malformed"),
        sequence: 1,
        contract: { id: "tool.execute", version: { major: 1, minor: 0 } },
        capabilities: [],
        input: {},
      },
    };
    fixture.transport.send(request);
    await waitFor(() =>
      expect(
        fixture.evidence.some(
          (entry) =>
            entry.kind === "frame" &&
            (entry.value as { error?: { data?: { kind?: string } } }).error?.data?.kind ===
              "invalid-input",
        ),
      ).toBe(true),
    );
  },
);

test("both transports expose the same successful protocol transcript", async (context) => {
  const transcripts: JsonValue[][] = [];
  for (const kind of kinds) {
    const fixture = await initializedFixture(context, kind);
    await execute(fixture, "equivalent", "nested");
    transcripts.push(
      fixture.evidence
        .filter((entry) => entry.kind === "frame")
        .map((entry) => roundTripJson(entry.value)),
    );
  }
  expect(transcripts[0]).toEqual(transcripts[1]);
});

test("in-process delivery rejects values that standard streams cannot encode", (context) => {
  const fixture = createFixture(context, "in-process");
  for (const value of [
    { value: undefined },
    { value: () => {} },
    { value: "x".repeat(1024 * 1024) },
  ]) {
    expect(() => fixture.transport.send(value)).toThrow();
  }
});

test.for(kinds)(
  "%s stops on out-of-order progress without publishing a terminal success",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    await expect(execute(fixture, "ordering", "ordering")).rejects.toMatchObject({
      failure: { kind: "protocol-failure" },
    });
    expect(fixture.broker.isStopped()).toBe(true);
    expect(
      fixture.evidence.filter(
        (entry) => entry.kind === "interrupted" && entry.invocationId === "ordering",
      ),
    ).toHaveLength(1);
  },
);

test.for(kinds)(
  "%s rejects invalid contribution output and revoked capabilities after cancellation",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    await expect(execute(fixture, "invalid-output", "invalid-output")).rejects.toMatchObject({
      failure: { kind: "invalid-input" },
    });
    const outcome = execute(fixture, "revoked", "race").catch((error: unknown) => error);
    await waitForProgress(fixture, "revoked");
    fixture.broker.cancel("revoked", "The fixture revokes its grant.", Date.now() + 1000);
    expect(await outcome).toMatchObject({ failure: { kind: "cancellation" } });
  },
);

test.for(kinds)(
  "%s refuses unrecorded terminal output and preserves preceding evidence",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    fixture.failTerminalEvidence();
    await expect(execute(fixture, "evidence-terminal", "echo")).rejects.toThrow(
      "Evidence recording fails",
    );
    expect(
      frames(fixture, "evidence-terminal").map((frame) =>
        "method" in frame ? frame.method : "terminal",
      ),
    ).toEqual(["tool.execute", "log", "progress"]);
    expect(fixture.broker.isStopped()).toBe(true);
  },
);

test.for(kinds)(
  "%s validates exact tool arguments without coercion or execution",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    await expect(
      fixture.broker.request("tool.execute", referenceIdentity("arguments"), {
        definition: referenceTool,
        arguments: { mode: 2, value: null },
        handles: [],
      }),
    ).rejects.toMatchObject({
      failure: { kind: "invalid-input", locations: [{ pointer: "/mode" }] },
    });
    expect(
      frames(fixture, "arguments").some(
        (frame) => "method" in frame && frame.method === "progress",
      ),
    ).toBe(false);
  },
);

test.for(kinds)(
  "%s records late notifications without changing a settled outcome",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    await execute(fixture, "late", "echo");
    const terminal = frames(fixture, "late").find((frame) => "result" in frame);
    expect(terminal).toBeDefined();
    fixture.transport.send({
      jsonrpc: "2.0",
      method: "cancel",
      params: {
        wireVersion: { major: 1, minor: 0 },
        identity: referenceIdentity("late"),
        contract: { id: "tool.execute", version: { major: 1, minor: 0 } },
        sequence: 2,
        data: { reason: "A late request is evidence only.", deadline: Date.now() + 1000 },
      },
    });
    const resource = (await fixture.broker.request(
      "resource.resolve",
      referenceIdentity("late-evidence"),
      { resourceId: "evidence", access: [] },
    )) as { content: JsonValue[] };
    expect(resource.content.some((entry) => (entry as { kind: string }).kind === "late")).toBe(
      true,
    );
    expect(frames(fixture, "late").find((frame) => "result" in frame)).toEqual(terminal);
  },
);

test.for(kinds)(
  "%s freezes captured inputs and negotiated versions against caller mutation",
  async (kind, context) => {
    const fixture = createFixture(context, kind);
    const selected = (await initialize(fixture)) as {
      contracts: Record<string, { major: number; minor: number }>;
    };
    const toolContract = selected.contracts["tool.execute"];
    if (toolContract !== undefined) {
      toolContract.minor = 7;
    }
    const identity = referenceIdentity("snapshot");
    const value = { captured: "original" };
    const result = fixture.broker.request("tool.execute", identity, {
      definition: referenceTool,
      arguments: { mode: "echo", value },
      handles: [],
    });
    identity.configurationRevision = "later";
    value.captured = "later";
    expect(await result).toMatchObject({ structuredData: { captured: "original" } });
  },
);

test.for(kinds)(
  "%s rejects duplicate delivery without a second terminal response",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    const result = execute(fixture, "duplicate", "wait").catch((error: unknown) => error);
    await waitForProgress(fixture, "duplicate");
    fixture.transport.send(frames(fixture, "duplicate")[0]);
    expect(await result).toBeInstanceOf(Error);
    expect(
      frames(fixture, "duplicate").filter((frame) => "result" in frame || "error" in frame),
    ).toHaveLength(0);
    expect(
      fixture.evidence.filter(
        (entry) => entry.kind === "interrupted" && entry.invocationId === "duplicate",
      ),
    ).toHaveLength(1);
  },
);

test.for(kinds)(
  "%s prevents nested work from widening its parent authority",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind);
    await expect(
      fixture.broker.request("tool.execute", referenceIdentity("narrow"), {
        definition: referenceTool,
        arguments: { mode: "nested", value: null },
        handles: [],
      }),
    ).rejects.toMatchObject({ failure: { kind: "denied-authority" } });
    expect(frames(fixture, "narrow.read")).toEqual([]);
  },
);

const invalidResults: {
  name: string;
  method: "stage.apply" | "tool.execute";
  input: JsonValue;
  pointer: string;
}[] = [
  ...[
    {
      name: "observer replacement",
      mode: "observe",
      allowedEffects: [],
      value: { action: "replace", replacement: {} },
    },
    {
      name: "observer block",
      mode: "observe",
      allowedEffects: ["block"],
      value: { action: "block", reason: { id: "blocked", values: {} } },
    },
    {
      name: "ungranted replacement",
      mode: "transform",
      allowedEffects: [],
      value: { action: "replace", replacement: {} },
    },
    {
      name: "ungranted block",
      mode: "transform",
      allowedEffects: [],
      value: { action: "block", reason: { id: "blocked", values: {} } },
    },
    {
      name: "replacement schema violation",
      mode: "transform",
      allowedEffects: ["replace"],
      value: { action: "replace", replacement: { count: "2" } },
    },
    {
      name: "invalid operation output",
      mode: "transform",
      allowedEffects: [],
      value: { invalid: true },
    },
  ].map((entry) => ({
    name: entry.name,
    method: "stage.apply" as const,
    input: roundTripJson({
      stage: "context",
      mode: entry.mode,
      allowedEffects: entry.allowedEffects,
      value: entry.value,
      replacementSchema: integerCountSchema,
    }),
    pointer:
      entry.name === "replacement schema violation"
        ? "/count"
        : entry.name === "invalid operation output"
          ? ""
          : "/action",
  })),
  {
    name: "tool result schema violation",
    method: "tool.execute",
    input: {
      definition: {
        ...(referenceTool as Record<string, JsonValue>),
        resultSchema: { type: "integer" },
      },
      arguments: { mode: "echo", value: "2" },
      handles: [],
    },
    pointer: "",
  },
];

test.for(kinds.flatMap((kind) => invalidResults.map((entry) => ({ kind, ...entry }))))(
  "$kind rejects raw $name on receipt with contract evidence",
  async ({ kind, name, method, input, pointer }, context) => {
    const fixture = await initializedFixture(context, kind, true);
    await expect(
      fixture.broker.request(method, referenceIdentity(name), input),
    ).rejects.toMatchObject({
      failure: {
        kind: "invalid-input",
        identity: { invocationId: name },
        dispatch: "known",
        effects: "uncertain",
        locations: expect.arrayContaining([expect.objectContaining({ pointer })]),
      },
    });
    const records = fixture.evidence.filter((entry) => entry.invocationId === name);
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "frame", direction: "received" }),
        expect.objectContaining({
          kind: "rejected",
          value: expect.objectContaining({
            failure: expect.objectContaining({ kind: "invalid-input" }),
          }),
        }),
      ]),
    );
    expect(fixture.broker.isStopped()).toBe(true);
  },
);

const malformedFrames: { name: string; value: JsonValue }[] = [
  {
    name: "missing error data",
    value: {
      jsonrpc: "2.0",
      id: "bad",
      error: { code: -32000, message: "Missing protocol data." },
    },
  },
  {
    name: "null error data",
    value: {
      jsonrpc: "2.0",
      id: "bad",
      error: { code: -32000, message: "Null protocol data.", data: null },
    },
  },
  {
    name: "scalar error data",
    value: {
      jsonrpc: "2.0",
      id: "bad",
      error: { code: -32000, message: "Scalar protocol data.", data: 1 },
    },
  },
  {
    name: "null request parameters",
    value: { jsonrpc: "2.0", id: "bad", method: "describe", params: null },
  },
  {
    name: "invalid invocation id",
    value: { jsonrpc: "2.0", id: "bad", result: { identity: { invocationId: 7 } } },
  },
  {
    name: "negative request id",
    value: { jsonrpc: "2.0", id: -1, method: "describe", params: null },
  },
  { name: "empty request id", value: { jsonrpc: "2.0", id: "", method: "describe", params: null } },
  { name: "null frame", value: null },
  { name: "array frame", value: [] },
];

test.for(kinds.flatMap((kind) => malformedFrames.map((entry) => ({ kind, ...entry }))))(
  "$kind records $name before rejection and protocol errors",
  async ({ kind, name, value }, context) => {
    const fixture = await initializedFixture(context, kind, true);
    const start = fixture.evidence.length;
    await expect(execute(fixture, name, "malformed-frame", value)).rejects.toThrow();
    const records = fixture.evidence.slice(start);
    const received = records.findIndex(
      (entry) =>
        entry.kind === "frame" && entry.direction === "received" && equalJson(entry.value, value),
    );
    const rejected = records.findIndex((entry) => entry.kind === "rejected");
    const response = records.findIndex(
      (entry) =>
        entry.kind === "frame" && entry.direction === "sent" && "error" in Object(entry.value),
    );
    expect(received).toBeGreaterThanOrEqual(0);
    expect(rejected).toBeGreaterThan(received);
    expect(response).toBeGreaterThan(rejected);
    expect(records[response]?.value).toMatchObject({
      error: {
        code: -32600,
        data: { kind: "protocol-failure", dispatch: "absent", effects: "absent" },
      },
    });
    expect(fixture.broker.isStopped()).toBe(true);
  },
);

test.for(kinds)(
  "%s records all outgoing predispatch denials without sending frames",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind, true);
    const attempts = [
      {
        id: "changed-run",
        identity: { ...referenceIdentity("changed-run"), runId: "other" },
        method: "describe" as const,
        input: {},
        capabilities: [],
      },
      {
        id: "changed-instance",
        identity: { ...referenceIdentity("changed-instance"), componentInstanceId: "other" },
        method: "describe" as const,
        input: {},
        capabilities: [],
      },
      {
        id: "changed-revision",
        identity: { ...referenceIdentity("changed-revision"), configurationRevision: "other" },
        method: "describe" as const,
        input: {},
        capabilities: [],
      },
      {
        id: "expired",
        identity: { ...referenceIdentity("expired"), deadline: 0 },
        method: "describe" as const,
        input: {},
        capabilities: [],
      },
      {
        id: "parent",
        identity: { ...referenceIdentity("parent"), parentInvocationId: "absent" },
        method: "describe" as const,
        input: {},
        capabilities: [],
      },
      {
        id: "capability",
        identity: referenceIdentity("capability"),
        method: "describe" as const,
        input: {},
        capabilities: ["ungranted"],
      },
      {
        id: "authorization",
        identity: referenceIdentity("authorization"),
        method: "state.read" as const,
        input: { handle: "ungranted", key: "sample" },
        capabilities: [],
      },
      {
        id: "input",
        identity: referenceIdentity("input"),
        method: "describe" as const,
        input: { unexpected: true },
        capabilities: [],
      },
      {
        id: "arguments",
        identity: referenceIdentity("arguments"),
        method: "tool.execute" as const,
        input: { definition: referenceTool, arguments: { mode: 2, value: null }, handles: [] },
        capabilities: [],
      },
    ];
    for (const attempt of attempts) {
      await expect(
        fixture.broker.request(
          attempt.method,
          attempt.identity,
          roundTripJson(attempt.input),
          attempt.capabilities,
        ),
      ).rejects.toMatchObject({ failure: { dispatch: "absent", effects: "absent" } });
      const records = fixture.evidence.filter((entry) => entry.invocationId === attempt.id);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        kind: "rejected",
        direction: "local",
        value: {
          failure: {
            identity: attempt.identity,
            contract: { id: attempt.method },
            dispatch: "absent",
            effects: "absent",
          },
        },
      });
    }
    expect(fixture.broker.isStopped()).toBe(false);
  },
);

test.for(kinds)(
  "%s records oversized outgoing frames as failed without dispatch",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind, true);
    await expect(
      execute(fixture, "oversized", "echo", "x".repeat(1024 * 1024)),
    ).rejects.toMatchObject({
      failure: {
        identity: { invocationId: "oversized" },
        dispatch: "absent",
        effects: "absent",
        locations: [{ reason: expect.stringContaining("byte limit") }],
      },
    });
    const records = fixture.evidence.filter((entry) => entry.invocationId === "oversized");
    expect(records.map((entry) => [entry.kind, entry.direction])).toEqual([["rejected", "local"]]);
    expect(records[0]?.value).toMatchObject({
      dispatch: "absent",
      failure: { dispatch: "absent", effects: "absent" },
    });
    expect(fixture.broker.isStopped()).toBe(false);
  },
);

test.for(kinds)(
  "%s records invalid outgoing values and preserves safe correlation",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind, true);
    const input = {
      definition: referenceTool,
      arguments: { mode: "echo", value: undefined },
      handles: [],
    } as unknown as JsonValue;
    await expect(
      fixture.broker.request("tool.execute", referenceIdentity("non-json"), input),
    ).rejects.toMatchObject({
      failure: {
        kind: "invalid-input",
        identity: { invocationId: "non-json" },
        dispatch: "absent",
        effects: "absent",
      },
    });
    expect(
      fixture.evidence.find((entry) => entry.invocationId === "non-json")?.value,
    ).toMatchObject({ frame: null, dispatch: "absent", failure: { kind: "invalid-input" } });
    expect(frames(fixture, "non-json")).toHaveLength(0);
    const identity = { ...referenceIdentity("invalid-identity"), deadline: -1 };
    await expect(fixture.broker.request("describe", identity, {})).rejects.toMatchObject({
      failure: { kind: "invalid-input", identity: null },
    });
    expect(fixture.evidence.at(-1)?.value).toMatchObject({
      frame: { params: { identity } },
      dispatch: "absent",
      failure: { contract: { id: "describe" }, dispatch: "absent", effects: "absent" },
    });
  },
);

test.for(kinds)(
  "%s settles when cancellation cannot be encoded and keeps invocation uncertainty",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind, true);
    const outcome = execute(fixture, "notification", "hold").catch((error: unknown) => error);
    expect(() =>
      fixture.broker.cancel("notification", "x".repeat(1024 * 1024), Date.now() + 1000),
    ).toThrow("byte limit");
    expect(
      fixture.evidence.find(
        (entry) => entry.kind === "rejected" && entry.invocationId === "notification",
      )?.value,
    ).toMatchObject({
      dispatch: "absent",
      frame: { method: "cancel" },
      failure: { dispatch: "known", effects: "uncertain" },
    });
    expect(
      frames(fixture, "notification").map((frame) =>
        "method" in frame ? frame.method : "response",
      ),
    ).toEqual(["tool.execute"]);
    await waitForClosedFixture(fixture);
    expect(await outcome).toMatchObject({ failure: { dispatch: "known", effects: "uncertain" } });
  },
);

const replacementInput: JsonValue = {
  stage: "context",
  mode: "transform",
  allowedEffects: ["replace"],
  replacementSchema: integerCountSchema,
  value: { action: "replace", replacement: { count: 2 } },
};
const cancellationCases: { method: Operation; input: JsonValue }[] = [
  { method: "initialize", input: referenceOffer() },
  { method: "dispose", input: { reason: "The fixture ends." } },
  {
    method: "stage.apply",
    input: replacementInput,
  },
  {
    method: "loop.run",
    input: { setup: { configurationRevision: "captured-1", components: [] }, acceptedInput: null },
  },
  { method: "resource.resolve", input: { resourceId: "fixture", access: [] } },
  {
    method: "tool.execute",
    input: { definition: referenceTool, arguments: { mode: "echo", value: "late" }, handles: [] },
  },
  {
    method: "tool.execute",
    input: {
      definition: referenceTool,
      arguments: { mode: "late-error", value: null },
      handles: [],
    },
  },
  {
    method: "stage.apply",
    input: {
      ...replacementInput,
      value: { action: "replace", replacement: { count: "invalid" } },
    },
  },
];

test.for(kinds.flatMap((kind) => cancellationCases.map((entry) => ({ kind, ...entry }))))(
  "$kind settles cancelled $method as cancellation and retains the late response",
  async ({ kind, method, input }, context) => {
    const fixture = createFixture(context, kind, true);
    if (method !== "initialize") {
      await initialize(fixture);
    }
    const outcome = fixture.broker
      .request(method, referenceIdentity("cancel-race"), input)
      .catch((error: unknown) => error);
    fixture.broker.cancel(
      "cancel-race",
      "Cancellation wins before response delivery.",
      Date.now() + 60_000,
    );
    expect(await outcome).toMatchObject({
      failure: { kind: "cancellation", dispatch: "known", effects: "uncertain" },
    });
    expect(
      fixture.evidence.filter(
        (entry) => entry.kind === "late" && entry.invocationId === "cancel-race",
      ),
    ).toHaveLength(1);
    if (method === "initialize") {
      await expect(
        fixture.broker.request("describe", referenceIdentity("after-cancel"), {}),
      ).rejects.toThrow("Initialization");
    } else {
      await expect(
        fixture.broker.request("describe", referenceIdentity("after-cancel"), {}),
      ).resolves.toMatchObject({ id: "reference" });
    }
  },
);

test.for(kinds)(
  "%s keeps duplicate terminal responses as evidence after settlement",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind, true);
    expect(
      await execute(fixture, "terminal-duplicate", "duplicate-terminal", "original"),
    ).toMatchObject({ structuredData: "original" });
    await waitFor(() =>
      expect(
        fixture.evidence.filter(
          (entry) => entry.kind === "late" && entry.invocationId === "terminal-duplicate",
        ),
      ).toHaveLength(1),
    );
    expect(fixture.broker.isStopped()).toBe(false);
  },
);

test.for(
  kinds.flatMap((kind) =>
    [
      "oversized-output",
      "oversized-error",
      "oversized-causes",
      "denied",
      "empty-error",
      "invalid-failure",
      "invalid-failure-fields",
    ].map((mode) => ({ kind, mode })),
  ),
)(
  "$kind bounds $mode terminal failures and keeps delivery usable",
  async ({ kind, mode }, context) => {
    const fixture = await initializedFixture(context, kind, "peer");
    const outcome =
      mode === "denied"
        ? fixture.broker.request("resource.resolve", referenceIdentity(mode), {
            resourceId: "denied",
            access: [],
          })
        : execute(fixture, mode, mode);
    await expect(outcome).rejects.toMatchObject({
      failure: {
        kind: "protocol-failure",
        identity: { invocationId: mode },
        dispatch: "known",
        effects: "uncertain",
      },
    });
    const terminal = frames(fixture, mode).find((frame) => "error" in frame);
    expect(terminal).toBeDefined();
    expect(encodeFrame(terminal).length - 1).toBeLessThanOrEqual(maximumFrameBytes);
    expect(
      await fixture.broker.request("describe", referenceIdentity("after-large"), {}),
    ).toMatchObject({ id: "reference" });
    const evidence = (await fixture.broker.request(
      "resource.resolve",
      referenceIdentity("large-evidence"),
      { resourceId: "evidence", access: [] },
    )) as { content: JsonValue[] };
    expect(evidence.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "rejected",
          invocationId: mode,
          bytes: expect.any(Number),
          failure: expect.objectContaining({ dispatch: "known", effects: "uncertain" }),
        }),
        expect.objectContaining({
          kind: "frame",
          direction: "sent",
          invocationId: mode,
          bytes: expect.any(Number),
        }),
      ]),
    );
    expect(fixture.broker.isStopped()).toBe(false);
  },
);

test.for(kinds)(
  "%s settles notification encoding failures through a terminal error",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind, "peer");
    await expect(execute(fixture, "large-progress", "oversized-progress")).rejects.toMatchObject({
      failure: { dispatch: "known", effects: "uncertain" },
    });
    expect(
      await fixture.broker.request("describe", referenceIdentity("after-progress"), {}),
    ).toMatchObject({ id: "reference" });
    expect(frames(fixture, "large-progress").at(-1)).toMatchObject({
      error: { data: { sequence: 1 } },
    });
  },
);

test.for(kinds)(
  "%s closes delivery when even bounded terminal correlation exceeds the frame limit",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind, "holding-peer");
    const identity = referenceIdentity("large-correlation");
    identity.invocationId = "x".repeat(maximumFrameBytes - 400);
    await expect(fixture.broker.request("describe", identity, {})).rejects.toThrow();
    await waitForClosedFixture(fixture);
  },
);

test.for(
  kinds.flatMap((kind) =>
    ["fail-terminal", "fail-progress", "fail-log"].map((mode) => ({ kind, mode })),
  ),
)("$kind settles the caller and closes after component $mode", async ({ kind, mode }, context) => {
  const fixture = await initializedFixture(context, kind, "peer");
  await expect(execute(fixture, mode, mode)).rejects.toThrow("worker ends");
  await waitForClosedFixture(fixture);
});

test.for(kinds)(
  "%s treats a response after received cancellation as evidence only",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind, true);
    await expect(execute(fixture, "remote-cancel", "echo", "late")).rejects.toMatchObject({
      failure: { kind: "cancellation" },
    });
    expect(
      fixture.evidence.filter(
        (entry) => entry.kind === "late" && entry.invocationId === "remote-cancel",
      ),
    ).toHaveLength(1);
  },
);

test.for(kinds)(
  "%s rejects late nested output after parent cancellation",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind, true);
    const parent = execute(fixture, "parent-cancel", "hold").catch((error: unknown) => error);
    const child = fixture.broker
      .request(
        "stage.apply",
        { ...referenceIdentity("child-cancel"), parentInvocationId: "parent-cancel" },
        replacementInput,
      )
      .catch((error: unknown) => error);
    fixture.broker.cancel(
      "parent-cancel",
      "Cancel the owned invocation graph.",
      Date.now() + 60_000,
    );
    expect(await child).toMatchObject({ failure: { kind: "cancellation" } });
    expect(
      fixture.evidence.filter(
        (entry) => entry.kind === "late" && entry.invocationId === "child-cancel",
      ),
    ).toHaveLength(1);
    fixture.broker.close();
    expect(await parent).toBeInstanceOf(Error);
  },
);

test.for(
  kinds.flatMap((kind) => ["request", "response", "cancel"].map((path) => ({ kind, path }))),
)("$kind closes delivery after a $path send failure", async ({ kind, path }, context) => {
  const fixture = await initializedFixture(context, kind);
  if (path === "request") {
    fixture.failSend();
    await expect(execute(fixture, "send-failure", "echo")).rejects.toThrow("send fails");
  } else if (path === "response") {
    const outcome = execute(fixture, "send-failure", "nested");
    fixture.failSend();
    await expect(outcome).rejects.toThrow("send fails");
  } else {
    const outcome = execute(fixture, "send-failure", "wait").catch((error: unknown) => error);
    await waitForProgress(fixture, "send-failure");
    fixture.failSend();
    expect(() =>
      fixture.broker.cancel("send-failure", "Stop delivery.", Date.now() + 60_000),
    ).toThrow("send fails");
    expect(fixture.broker.isStopped()).toBe(true);
    expect(await outcome).toBeInstanceOf(Error);
  }
  await waitForClosedFixture(fixture);
});

test.for(kinds)(
  "%s closes fatal receive rejection so remote invocations cannot wait indefinitely",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind, true);
    await expect(
      fixture.broker.request(
        "stage.apply",
        referenceIdentity("fatal-result"),
        invalidResults[0]?.input as JsonValue,
      ),
    ).rejects.toThrow();
    expect(() => fixture.transport.send({})).toThrow("closed");
  },
);

test.for(kinds)(
  "%s closes delivery when a malformed frame cannot receive a bounded error",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind, true);
    await expect(execute(fixture, "large-malformed", "large-malformed-frame")).rejects.toThrow(
      "byte limit",
    );
    expect(() => fixture.transport.send({})).toThrow("closed");
    expect(
      fixture.evidence.some((entry) => entry.kind === "rejected" && entry.direction === "local"),
    ).toBe(true);
  },
);

test.for(kinds)(
  "%s contains deadline cancellation send failures and settles the caller",
  async (kind, context) => {
    const fixture = await initializedFixture(context, kind, true);
    const outcome = fixture.broker.request(
      "tool.execute",
      { ...referenceIdentity("deadline-send"), deadline: Date.now() + 1000 },
      {
        definition: referenceTool,
        arguments: { mode: "hold", value: null },
        handles: [],
      },
    );
    fixture.failSend();
    await expect(outcome).rejects.toThrow("send fails");
    await waitForClosedFixture(fixture);
  },
);
