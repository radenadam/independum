import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, type TestContext, test } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import {
  createProtocolPeer,
  type EvidenceRecord,
  ProtocolError,
  type ProtocolPeer,
} from "./create-protocol-peer.ts";
import {
  createReferenceComponent,
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
} from "./transports.ts";

interface Fixture {
  broker: ProtocolPeer;
  transport: ProtocolTransport;
  evidence: EvidenceRecord[];
  componentEvidence: EvidenceRecord[];
  failEvidence(): void;
  failTerminalEvidence(): void;
}
const kinds = ["in-process", "standard-streams"] as const;

function createFixture(context: TestContext, kind: (typeof kinds)[number]): Fixture {
  context.signal.throwIfAborted();
  let transport: ProtocolTransport;
  let component: ProtocolPeer | undefined;
  const componentEvidence: EvidenceRecord[] = [];
  if (kind === "in-process") {
    const pair = createInProcessTransports();
    transport = pair[0];
    component = createReferenceComponent(pair[1], (entry) => componentEvidence.push(entry));
  } else {
    const worker = spawn(
      process.execPath,
      [fileURLToPath(new URL("./reference-worker.ts", import.meta.url))],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    function terminate(): void {
      worker.kill();
    }
    registerTestCleanup(context, terminate);
    transport = createStreamTransport({
      input: worker.stdout,
      output: worker.stdin,
      diagnostics: worker.stderr,
      worker,
    });
  }
  const evidence: EvidenceRecord[] = [];
  let doesEvidenceFail = false;
  let doesTerminalEvidenceFail = false;
  const broker = createProtocolPeer({
    transport,
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
  };
}

async function initialize(fixture: Fixture): Promise<JsonValue> {
  return fixture.broker.request("initialize", referenceIdentity("initialize"), referenceOffer());
}
async function initializedFixture(
  context: TestContext,
  kind: (typeof kinds)[number],
): Promise<Fixture> {
  const fixture = createFixture(context, kind);
  await initialize(fixture);
  return fixture;
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
        replacementSchema: {
          type: "object",
          required: ["count"],
          properties: { count: { type: "integer" } },
        },
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
    expect(await outcome).toMatchObject({ failure: { kind: "denied-authority" } });
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
