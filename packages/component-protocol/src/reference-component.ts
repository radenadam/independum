import { createCollidingStateReader } from "./create-colliding-state-reader.ts";
import {
  createProtocolPeer,
  type EvidenceRecord,
  type InvocationContext,
  type PeerOptions,
  type ProtocolPeer,
} from "./create-protocol-peer.ts";
import {
  equalJson,
  type InvocationIdentity,
  type JsonValue,
  type Operation,
  operationInputs,
  operationOutputs,
  protocolVersion,
  type RequestFrame,
  roundTripJson,
  type Version,
} from "./schemas.ts";
import type { ProtocolTransport } from "./transports.ts";

export const referenceBinding: Pick<
  InvocationIdentity,
  "runId" | "componentInstanceId" | "configurationRevision"
> = {
  runId: "fixture-run",
  componentInstanceId: "reference",
  configurationRevision: "captured-1",
};
export const referenceContracts: Record<string, Version> = Object.fromEntries(
  Object.keys(operationInputs).map((name) => [name, protocolVersion]),
);
export const referencePeerOptions: Pick<
  PeerOptions,
  "role" | "binding" | "contracts" | "capabilities"
> = {
  role: "component",
  binding: referenceBinding,
  contracts: referenceContracts,
  capabilities: ["fixture.read"],
};
export const referenceDigest: string = `sha256:${"a".repeat(64)}`;
export const referenceTool: JsonValue = {
  definitionVersion: { major: 1, minor: 0 },
  id: "reference.echo",
  digest: referenceDigest,
  componentId: "reference",
  contributionId: "echo",
  name: "Echo",
  description: "Echo fixture values.",
  schemaDialect: "https://json-schema.org/draft/2020-12/schema",
  parameters: {
    type: "object",
    required: ["mode", "value"],
    additionalProperties: false,
    properties: { mode: { type: "string" }, value: {} },
  },
  resultSchema: null,
  executionOrder: "sequential",
  effects: [],
  requiredCapabilities: [],
  texts: [],
};
export const referenceManifest: JsonValue = {
  manifestVersion: { major: 1, minor: 0 },
  id: "reference",
  version: "1.0.0",
  purpose: "Exercise protocol conformance.",
  origin: { id: "independum", name: "Independum" },
  contributions: Object.entries({
    echo: { kind: "tool", operation: "tool.execute" },
    stage: { kind: "stage", operation: "stage.apply" },
    loop: { kind: "loop", operation: "loop.run" },
    resource: { kind: "resource", operation: "resource.resolve" },
  }).map(([id, contribution]) => ({
    id,
    kind: contribution.kind,
    contract: { id: contribution.operation, version: { major: 1, minor: 0 } },
    effects: [],
    dependencies: [],
    inputSchema: roundTripJson(operationInputs[contribution.operation as Operation]),
    outputSchema: roundTripJson(operationOutputs[contribution.operation as Operation]),
  })),
  entryPoint: "reference-worker.ts",
  runtime: "node",
  executableClosure: [{ path: "reference-worker.ts", digest: referenceDigest }],
  requestedCapabilities: ["fixture.read"],
  settingsSchema: {},
  texts: [],
  ownedFiles: [],
  installationSource: "fixture",
  restorationSource: null,
  signer: null,
};

/** Supplies recorded services and deliberately small contributions without model or external effects. */
export function createReferenceComponent(
  transport: ProtocolTransport,
  record: (entry: EvidenceRecord) => void,
): ProtocolPeer {
  const entries: EvidenceRecord[] = [];
  function capture(entry: EvidenceRecord): void {
    entries.push(entry);
    record(entry);
  }
  const collision = createCollidingStateReader(transport, capture);
  let peer: ProtocolPeer;
  async function execute(request: RequestFrame, context: InvocationContext): Promise<JsonValue> {
    const input = request.params.input as { arguments: { mode: string; value: JsonValue } };
    const { mode, value } = input.arguments;
    context.log("info", "The reference invocation starts.");
    context.progress({ step: 1 });
    let result = value;
    if (mode === "id-collision" || mode === "id-collision-duplicate") {
      result = await collision.read(request);
      if (mode === "id-collision-duplicate") {
        result = await collision.read(request, "again");
      }
    }
    if (mode === "ordering") {
      transport.send({
        jsonrpc: "2.0",
        method: "progress",
        params: {
          wireVersion: protocolVersion,
          identity: request.params.identity,
          contract: request.params.contract,
          sequence: 9,
          data: { value: "out of order" },
        },
      });
      return new Promise<JsonValue>(() => {});
    }
    if (mode === "invalid-output") {
      return { invalid: true };
    }
    if (mode === "exit") {
      transport.close();
      return new Promise<JsonValue>(() => {});
    }
    if (mode === "failure") {
      throw new Error("The reference contribution fails.");
    }
    if (mode === "wait" || mode === "race") {
      await new Promise<void>((resolve) => {
        if (context.signal.aborted) {
          resolve();
        } else {
          context.signal.addEventListener("abort", () => resolve(), { once: true });
        }
      });
      if (mode === "race") {
        context.assertCapability("fixture.read");
      }
    }
    if (mode === "nested" || mode === "denied") {
      result = await peer.request(
        "state.read",
        {
          ...request.params.identity,
          invocationId: `${request.params.identity.invocationId}.read`,
          parentInvocationId: request.params.identity.invocationId,
        },
        { handle: mode === "denied" ? "ungranted" : "fixture.read", key: "sample" },
        ["fixture.read"],
      );
    }
    return {
      content: [{ type: "text", text: "Reference output." }],
      structuredData: result,
      historicalDetails: null,
      isError: false,
    };
  }
  peer = createProtocolPeer({
    transport: collision.transport,
    ...referencePeerOptions,
    record: capture,
    authorize(request): void {
      if (request.method === "tool.execute") {
        const definition = (request.params.input as { definition: JsonValue }).definition;
        if (!equalJson(definition, referenceTool)) {
          throw new Error("The tool definition differs from the captured definition.");
        }
      }
    },
    handlers: {
      describe(): JsonValue {
        return referenceManifest;
      },
      dispose(): JsonValue {
        return { disposed: true, activitiesEnded: true };
      },
      "tool.execute": execute,
      "loop.run"(): JsonValue {
        return { settlement: "completed", records: [] };
      },
      "resource.resolve"(request): JsonValue {
        const input = request.params.input as { resourceId: string };
        return {
          content: input.resourceId === "evidence" ? roundTripJson(entries) : "fixture",
          source: "recorded",
          provenance: [],
        };
      },
      "stage.apply"(request): JsonValue {
        return (request.params.input as { value: JsonValue }).value;
      },
    },
  });
  return peer;
}

/** Creates broker-assigned invocation identity for a fixture. */
export function referenceIdentity(invocationId: string): InvocationIdentity {
  return { ...referenceBinding, invocationId, parentInvocationId: null, deadline: null };
}

/** Offers independent wire, manifest, and contribution versions with an explicit grant. */
export function referenceOffer(): JsonValue {
  return roundTripJson({
    wireVersions: [{ major: 1, minor: 3 }],
    manifestVersions: [{ major: 1, minor: 2 }],
    contracts: Object.fromEntries(
      Object.keys(referenceContracts).map((name) => [name, [{ major: 1, minor: 4 }]]),
    ),
    componentInstanceId: "reference",
    requestedCapabilities: ["fixture.read", "ungranted"],
    grantedCapabilities: ["fixture.read"],
  });
}

export const referenceOperations: Operation[] = Object.keys(operationInputs) as Operation[];
