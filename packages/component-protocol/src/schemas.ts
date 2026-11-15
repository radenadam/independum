import Type, { type TSchema } from "typebox";
import { Value } from "typebox/value";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type Operation =
  | "initialize"
  | "describe"
  | "dispose"
  | "loop.run"
  | "stage.apply"
  | "tool.execute"
  | "resource.resolve"
  | "model.call"
  | "component.call"
  | "state.read"
  | "state.write"
  | "effect.request";
export type ErrorKind =
  | "invalid-input"
  | "missing-dependency"
  | "denied-authority"
  | "execution-failure"
  | "cancellation"
  | "protocol-failure";
export interface Version {
  major: number;
  minor: number;
}
export interface Contract {
  id: string;
  version: Version;
}
export interface InvocationIdentity {
  runId: string;
  invocationId: string;
  parentInvocationId: string | null;
  componentInstanceId: string;
  configurationRevision: string;
  deadline: number | null;
}
export interface InvocationParameters {
  wireVersion: Version;
  identity: InvocationIdentity;
  sequence: number;
  contract: Contract;
  capabilities: string[];
  input: JsonValue;
}
export interface RequestFrame {
  jsonrpc: "2.0";
  id: string | number;
  method: Operation;
  params: InvocationParameters;
}
export interface NotificationFrame {
  jsonrpc: "2.0";
  method: "progress" | "log" | "cancel";
  params: {
    wireVersion: Version;
    identity: InvocationIdentity;
    sequence: number;
    contract: Contract;
    data: JsonValue;
  };
}
export interface DeliveryFacts {
  dispatch: "known" | "absent" | "uncertain";
  effects: "known" | "absent" | "uncertain";
}
export interface FailureCause extends DeliveryFacts {
  kind: ErrorKind;
  identity: InvocationIdentity | null;
  contract: Contract;
  locations: { pointer: string; reason: string }[];
}
export interface ProtocolFailure extends FailureCause {
  sequence: number;
  causes?: FailureCause[];
  text: { id: string; values: { [key: string]: JsonValue } } | null;
}
export class ContractValidationError extends Error {
  locations: { pointer: string; reason: string }[];
  constructor(locations: { pointer: string; reason: string }[]) {
    super("The value does not match its contract.");
    this.locations = locations;
  }
}
export class VersionNegotiationError extends Error {}
export interface EditableTextV1 {
  id: string;
  default: string;
  slots: Record<string, { meaning: string; example: JsonValue }>;
}
export interface ToolDefinitionV1 {
  definitionVersion: Version;
  id: string;
  digest: string;
  componentId: string;
  contributionId: string;
  name: string;
  description: string;
  schemaDialect: "https://json-schema.org/draft/2020-12/schema";
  parameters: boolean | { [key: string]: JsonValue };
  resultSchema: boolean | { [key: string]: JsonValue } | null;
  executionOrder: "sequential" | "parallel";
  effects: string[];
  requiredCapabilities: string[];
  texts: EditableTextV1[];
}
export interface ResponseFrame {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: DeliveryFacts & {
    identity: InvocationIdentity;
    contract: Contract;
    sequence: number;
    outcome: "completed";
    output: JsonValue;
  };
  error?: { code: number; message: string; data: ProtocolFailure };
}
export type ProtocolFrame = RequestFrame | NotificationFrame | ResponseFrame;

const text = Type.String({ minLength: 1 });
const integer = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const sequence = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const json = Type.Unknown();
const objectOptions = { additionalProperties: false };
const schemaDocument = Type.Union([
  Type.Boolean(),
  Type.Object({}, { additionalProperties: true }),
]);
const version = Type.Object({ major: integer, minor: integer }, objectOptions);
const currentVersion = Type.Object(
  { major: Type.Literal(1), minor: Type.Literal(0) },
  objectOptions,
);
const contract = Type.Object({ id: text, version }, objectOptions);
const identity = Type.Object(
  {
    runId: text,
    invocationId: text,
    parentInvocationId: Type.Union([text, Type.Null()]),
    componentInstanceId: text,
    configurationRevision: text,
    deadline: Type.Union([integer, Type.Null()]),
  },
  objectOptions,
);
const strings = Type.Array(text, { uniqueItems: true });
const digest = Type.String({ pattern: "^sha256:[a-f0-9]{64}$" });
const facts = {
  dispatch: Type.Enum(["known", "absent", "uncertain"]),
  effects: Type.Enum(["known", "absent", "uncertain"]),
};
const editableText = Type.Object(
  {
    id: text,
    default: Type.String(),
    slots: Type.Record(Type.String(), Type.Object({ meaning: text, example: json }, objectOptions)),
  },
  objectOptions,
);
const blob = Type.Object(
  {
    id: text,
    brokerId: text,
    digest,
    size: integer,
    mediaType: text,
    access: Type.Array(Type.Enum(["read", "write"]), { minItems: 1, uniqueItems: true }),
    retentionId: text,
  },
  objectOptions,
);
const provenance = Type.Object(
  {
    componentInstanceId: text,
    contributionId: text,
    source: text,
    pointer: Type.String(),
    digest,
  },
  objectOptions,
);
const contribution = Type.Object(
  {
    id: text,
    kind: Type.Enum(["tool", "loop", "stage", "resource", "service", "editor", "renderer"]),
    contract,
    effects: strings,
    dependencies: strings,
    inputSchema: schemaDocument,
    outputSchema: schemaDocument,
  },
  objectOptions,
);
const manifest = Type.Object(
  {
    manifestVersion: currentVersion,
    id: text,
    version: text,
    purpose: text,
    origin: Type.Object({ id: text, name: text }, objectOptions),
    contributions: Type.Array(contribution),
    entryPoint: text,
    runtime: text,
    executableClosure: Type.Array(Type.Object({ path: text, digest }, objectOptions), {
      minItems: 1,
    }),
    requestedCapabilities: strings,
    settingsSchema: schemaDocument,
    texts: Type.Array(editableText),
    ownedFiles: strings,
    installationSource: text,
    restorationSource: Type.Union([text, Type.Null()]),
    signer: Type.Union([text, Type.Null()]),
  },
  objectOptions,
);
const setup = Type.Object(
  {
    configurationRevision: text,
    components: Type.Array(
      Type.Object(
        {
          instanceId: text,
          version: text,
          digest,
          manifest,
          settings: json,
          texts: json,
          resources: Type.Array(json),
          provenance: Type.Array(provenance),
        },
        objectOptions,
      ),
    ),
  },
  objectOptions,
);
const toolDefinition = Type.Object(
  {
    definitionVersion: currentVersion,
    id: text,
    digest,
    componentId: text,
    contributionId: text,
    name: text,
    description: Type.String(),
    schemaDialect: Type.Literal("https://json-schema.org/draft/2020-12/schema"),
    parameters: schemaDocument,
    resultSchema: Type.Union([schemaDocument, Type.Null()]),
    executionOrder: Type.Enum(["sequential", "parallel"]),
    effects: strings,
    requiredCapabilities: strings,
    texts: Type.Array(editableText),
  },
  objectOptions,
);
const reference = Type.Object({ id: text, digest }, objectOptions);
const toolResult = Type.Object(
  {
    content: Type.Array(json),
    structuredData: json,
    historicalDetails: json,
    isError: Type.Boolean(),
  },
  objectOptions,
);
const modelInput = Type.Object(
  {
    context: json,
    selectedModel: Type.Object({ provider: text, model: text }, objectOptions),
    options: json,
    setup,
    purpose: text,
    predecessorCallId: Type.Union([text, Type.Null()]),
    providerPayloadStage: Type.Union([text, Type.Null()]),
  },
  objectOptions,
);
const versions = Type.Array(version, { minItems: 1, uniqueItems: true });
const versionCatalog = Type.Record(Type.String(), versions);
const selection = Type.Object(
  {
    wireVersion: version,
    manifestVersion: version,
    contracts: Type.Record(Type.String(), version),
    componentInstanceId: text,
    grantedCapabilities: strings,
  },
  objectOptions,
);

export const protocolVersion: Version = Object.freeze({ major: 1, minor: 0 });
export const maximumFrameBytes: number = 1024 * 1024;
export const operationInputs: Record<Operation, TSchema> = {
  initialize: Type.Object(
    {
      wireVersions: versions,
      manifestVersions: versions,
      contracts: versionCatalog,
      componentInstanceId: text,
      requestedCapabilities: strings,
      grantedCapabilities: strings,
    },
    objectOptions,
  ),
  describe: Type.Object({}, objectOptions),
  dispose: Type.Object({ reason: text }, objectOptions),
  "loop.run": Type.Object({ setup, acceptedInput: json }, objectOptions),
  "stage.apply": Type.Object(
    {
      stage: Type.Enum([
        "input",
        "before_agent_start",
        "context",
        "context_with_system",
        "before_provider_request",
        "tool_call",
        "tool_result",
      ]),
      mode: Type.Enum(["observe", "transform"]),
      value: json,
      allowedEffects: strings,
      replacementSchema: schemaDocument,
    },
    objectOptions,
  ),
  "tool.execute": Type.Object(
    { definition: toolDefinition, arguments: json, handles: strings },
    objectOptions,
  ),
  "resource.resolve": Type.Object({ resourceId: text, access: strings }, objectOptions),
  "model.call": modelInput,
  "component.call": Type.Object(
    {
      destination: text,
      contributionId: text,
      contract,
      input: json,
      handles: strings,
    },
    objectOptions,
  ),
  "state.read": Type.Object({ handle: text, key: text }, objectOptions),
  "state.write": Type.Object(
    { handle: text, key: text, value: json, approvalId: text },
    objectOptions,
  ),
  "effect.request": Type.Object(
    {
      permissionHandle: text,
      executionHandle: text,
      effect: text,
      arguments: json,
      approvalId: Type.Union([text, Type.Null()]),
    },
    objectOptions,
  ),
};
export const operationOutputs: Record<Operation, TSchema> = {
  initialize: selection,
  describe: manifest,
  dispose: Type.Object(
    { disposed: Type.Literal(true), activitiesEnded: Type.Boolean() },
    objectOptions,
  ),
  "loop.run": Type.Object(
    { settlement: Type.Enum(["completed", "stopped"]), records: Type.Array(reference) },
    objectOptions,
  ),
  "stage.apply": Type.Union([
    Type.Object({ action: Type.Literal("continue") }, objectOptions),
    Type.Object({ action: Type.Literal("replace"), replacement: json }, objectOptions),
    Type.Object(
      {
        action: Type.Literal("block"),
        reason: Type.Object(
          {
            id: text,
            values: Type.Record(Type.String(), json),
          },
          objectOptions,
        ),
      },
      objectOptions,
    ),
  ]),
  "tool.execute": toolResult,
  "resource.resolve": Type.Object(
    { content: json, source: text, provenance: Type.Array(provenance) },
    objectOptions,
  ),
  "model.call": Type.Object({ callId: text, record: reference, output: json }, objectOptions),
  "component.call": Type.Object({ invocationId: text, output: json }, objectOptions),
  "state.read": Type.Object({ value: json, revision: text }, objectOptions),
  "state.write": Type.Object({ revision: text }, objectOptions),
  "effect.request": Type.Object({ value: json, records: Type.Array(reference) }, objectOptions),
};
const envelope = {
  wireVersion: version,
  identity,
  sequence,
  contract,
};
const requestEnvelope = Type.Object(
  {
    jsonrpc: Type.Literal("2.0"),
    id: Type.Union([text, integer]),
    method: Type.Enum(Object.keys(operationInputs)),
    params: Type.Object({ ...envelope, capabilities: strings, input: json }, objectOptions),
  },
  objectOptions,
);
const request = Type.Union(
  Object.entries(operationInputs).map(([method, input]) =>
    Type.Object(
      {
        jsonrpc: Type.Literal("2.0"),
        id: Type.Union([text, integer]),
        method: Type.Literal(method),
        params: Type.Object({ ...envelope, capabilities: strings, input }, objectOptions),
      },
      objectOptions,
    ),
  ),
);
const notificationData = {
  progress: Type.Object({ value: json }, objectOptions),
  log: Type.Object(
    { level: Type.Enum(["debug", "info", "warning", "error"]), message: Type.String() },
    objectOptions,
  ),
  cancel: Type.Object({ reason: text, deadline: integer }, objectOptions),
};
const notification = Type.Union(
  Object.entries(notificationData).map(([method, data]) =>
    Type.Object(
      {
        jsonrpc: Type.Literal("2.0"),
        method: Type.Literal(method),
        params: Type.Object({ ...envelope, data }, objectOptions),
      },
      objectOptions,
    ),
  ),
);
const failureCause = {
  kind: Type.Enum([
    "invalid-input",
    "missing-dependency",
    "denied-authority",
    "execution-failure",
    "cancellation",
    "protocol-failure",
  ]),
  identity: Type.Union([identity, Type.Null()]),
  contract,
  locations: Type.Array(Type.Object({ pointer: Type.String(), reason: text }, objectOptions)),
  ...facts,
};
const failure = Type.Object(
  {
    ...failureCause,
    sequence: integer,
    causes: Type.Optional(Type.Array(Type.Object(failureCause, objectOptions))),
    text: Type.Union([
      Type.Object({ id: text, values: Type.Record(Type.String(), json) }, objectOptions),
      Type.Null(),
    ]),
  },
  objectOptions,
);
const response = Type.Union([
  Type.Object(
    {
      jsonrpc: Type.Literal("2.0"),
      id: Type.Union([text, integer]),
      result: Type.Object(
        {
          identity,
          contract,
          sequence,
          outcome: Type.Literal("completed"),
          output: json,
          ...facts,
        },
        objectOptions,
      ),
    },
    objectOptions,
  ),
  Type.Object(
    {
      jsonrpc: Type.Literal("2.0"),
      id: Type.Union([text, integer, Type.Null()]),
      error: Type.Object(
        {
          code: Type.Integer(),
          message: text,
          data: failure,
        },
        objectOptions,
      ),
    },
    objectOptions,
  ),
]);
const missingPortion = Type.Object({ portion: text, reason: text }, objectOptions);
const coverage = Type.Union([
  Type.Object(
    { isComplete: Type.Literal(true), missing: Type.Array(missingPortion, { maxItems: 0 }) },
    objectOptions,
  ),
  Type.Object(
    { isComplete: Type.Literal(false), missing: Type.Array(missingPortion, { minItems: 1 }) },
    objectOptions,
  ),
]);
const absence = Type.Object({ isPresent: Type.Literal(false), reason: text }, objectOptions);
const capturedValue = Type.Union([
  Type.Object({ isPresent: Type.Literal(true), value: json }, objectOptions),
  absence,
]);
const completeness = Type.Object(
  {
    input: coverage,
    attempts: coverage,
    rawOutput: coverage,
    normalizedOutput: coverage,
    blobs: coverage,
    predecessors: coverage,
  },
  objectOptions,
);

export const protocolSchemas: Record<string, TSchema> = {
  identity,
  version,
  contract,
  blob,
  manifest,
  setup,
  toolDefinition,
  toolResult,
  modelInput,
  request,
  notification,
  response,
  failure,
  completeness,
  capturedValue,
  cancelData: notificationData.cancel,
  frame: Type.Union([requestEnvelope, notification, response]),
  kernelRecord: Type.Object(
    {
      recordVersion: currentVersion,
      callId: text,
      parentCallId: Type.Union([text, absence]),
      requestId: text,
      chatId: Type.Union([text, absence]),
      branchId: Type.Union([text, absence]),
      identity,
      purpose: text,
      setup,
      input: modelInput,
      resolvedModel: capturedValue,
      providerPayloads: Type.Array(json),
      authenticationExclusions: strings,
      attempts: Type.Array(
        Type.Object(
          {
            id: text,
            callId: text,
            transport: text,
            dispatchedAt: Type.Union([integer, absence]),
            receivedAt: Type.Union([integer, absence]),
            outgoing: Type.Array(json),
            incoming: Type.Array(json),
            errors: Type.Array(json),
            predecessors: Type.Array(reference),
          },
          objectOptions,
        ),
      ),
      events: Type.Array(json),
      finalMessage: capturedValue,
      usage: capturedValue,
      finishReason: capturedValue,
      errors: Type.Array(json),
      cancellation: capturedValue,
      timing: capturedValue,
      outcome: Type.Enum([
        "prepared",
        "dispatch-attempted",
        "completed",
        "failed",
        "cancelled",
        "interrupted",
      ]),
      ...facts,
      completeness,
    },
    objectOptions,
  ),
};
for (const [name, schema] of Object.entries(protocolSchemas)) {
  protocolSchemas[name] = publishSchema(schema, name);
}
for (const name of Object.keys(operationInputs) as Operation[]) {
  operationInputs[name] = publishSchema(operationInputs[name], `${name}:input`);
  operationOutputs[name] = publishSchema(operationOutputs[name], `${name}:output`);
}

/** Checks a JSON value against an executable contract without conversion. */
export function validateValue(schema: TSchema, value: unknown): void {
  try {
    requireJson(value);
  } catch (error) {
    throw new ContractValidationError([
      { pointer: "", reason: error instanceof Error ? error.message : "The value is not JSON." },
    ]);
  }
  const errors = Value.Errors(schema, value);
  if (errors.length > 0) {
    throw new ContractValidationError(
      errors.map((error) => ({ pointer: error.instancePath, reason: error.message })),
    );
  }
}

/** Copies only values representable by both transports without losing fields or types. */
export function roundTripJson(value: unknown): JsonValue {
  requireJson(value);
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

/** Negotiates the highest shared minor within a shared major without upgrading authority. */
export function negotiateVersion(offered: Version[], supported: Version[]): Version {
  const candidates = offered.flatMap((left) =>
    supported
      .filter((right) => right.major === left.major)
      .map((right) => ({ major: left.major, minor: Math.min(left.minor, right.minor) })),
  );
  const chosen = candidates.toSorted(
    (left, right) => right.major - left.major || right.minor - left.minor,
  )[0];
  if (chosen === undefined) {
    throw new VersionNegotiationError("No compatible major version is available.");
  }
  return chosen;
}

function requireJson(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) {
    return;
  }
  if (typeof value !== "object" || value === null || ancestors.has(value)) {
    throw new Error("A protocol value must be exact JSON without cycles.");
  }
  const isArray = Array.isArray(value);
  if (!isArray && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error("A protocol object must have no custom prototype.");
  }
  ancestors.add(value);
  const keys = Reflect.ownKeys(value).filter((key) => !(isArray && key === "length"));
  if (isArray && keys.length !== value.length) {
    throw new Error("A protocol array must be dense without added properties.");
  }
  for (const [index, key] of keys.entries()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      descriptor?.enumerable !== true ||
      !("value" in descriptor) ||
      (isArray && key !== String(index))
    ) {
      throw new Error("A protocol field must be an enumerable JSON value.");
    }
    requireJson(descriptor.value, ancestors);
  }
  ancestors.delete(value);
}

function publishSchema(schema: TSchema, name: string): TSchema {
  // TypeBox's nonenumerable authoring metadata is not part of JSON Schema.
  return Object.assign(JSON.parse(JSON.stringify(schema)) as TSchema, {
    $id: `urn:independum:component-protocol:${name}:1.0`,
    $schema: "https://json-schema.org/draft/2020-12/schema",
  });
}
