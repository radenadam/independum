import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { expect, test } from "vitest";
import {
  referenceContracts,
  referenceDigest,
  referenceIdentity,
  referenceManifest,
  referenceOffer,
  referenceOperations,
  referenceTool,
} from "./reference-component.ts";
import {
  equalJson,
  type JsonValue,
  negotiateVersion,
  type Operation,
  operationInputs,
  operationOutputs,
  protocolSchemas,
  roundTripJson,
  validateValue,
} from "./schemas.ts";

function operationSamples(): {
  inputs: Record<Operation, JsonValue>;
  outputs: Record<Operation, JsonValue>;
} {
  const setup = { configurationRevision: "captured-1", components: [] };
  const contract = { id: "resource.resolve", version: { major: 1, minor: 0 } };
  const reference = { id: "record-1", digest: referenceDigest };
  return {
    inputs: {
      initialize: referenceOffer(),
      describe: {},
      dispose: { reason: "The sample ends." },
      "loop.run": { setup, acceptedInput: { text: "sample" } },
      "stage.apply": {
        stage: "input",
        mode: "observe",
        value: {},
        allowedEffects: [],
        replacementSchema: {},
      },
      "tool.execute": {
        definition: referenceTool,
        arguments: { mode: "echo", value: 1 },
        handles: [],
      },
      "resource.resolve": { resourceId: "sample", access: [] },
      "model.call": {
        context: { messages: [] },
        selectedModel: { provider: "recorded", model: "sample" },
        options: {},
        setup,
        purpose: "sample",
        predecessorCallId: null,
        providerPayloadStage: null,
      },
      "component.call": {
        destination: "recorded",
        contributionId: "sample",
        contract,
        input: {},
        handles: [],
      },
      "state.read": { handle: "recorded.read", key: "sample" },
      "state.write": {
        handle: "recorded.write",
        key: "sample",
        value: 1,
        approvalId: "recorded.approval",
      },
      "effect.request": {
        permissionHandle: "recorded.permission",
        executionHandle: "recorded.execution",
        effect: "sample",
        arguments: {},
        approvalId: null,
      },
    },
    outputs: {
      initialize: {
        wireVersion: { major: 1, minor: 0 },
        manifestVersion: { major: 1, minor: 0 },
        contracts: {},
        componentInstanceId: "reference",
        grantedCapabilities: [],
      },
      describe: referenceManifest,
      dispose: { disposed: true, activitiesEnded: true },
      "loop.run": { settlement: "completed", records: [reference] },
      "stage.apply": { action: "continue" },
      "tool.execute": {
        content: [],
        structuredData: null,
        historicalDetails: null,
        isError: false,
      },
      "resource.resolve": { content: "recorded", source: "sample", provenance: [] },
      "model.call": { callId: "call-1", record: reference, output: "recorded" },
      "component.call": { invocationId: "nested-1", output: "recorded" },
      "state.read": { value: 1, revision: "captured-1" },
      "state.write": { revision: "captured-2" },
      "effect.request": { value: "recorded", records: [reference] },
    },
  };
}

test.for(referenceOperations)(
  "%s accepts json inputs and outputs and rejects unknown fields",
  (operation) => {
    const samples = operationSamples();
    for (const [schema, value] of [
      [operationInputs[operation], samples.inputs[operation]],
      [operationOutputs[operation], samples.outputs[operation]],
    ] as const) {
      validateValue(schema, roundTripJson(value));
      expect(() =>
        validateValue(schema, { ...(value as Record<string, JsonValue>), unexpected: true }),
      ).toThrow();
    }
  },
);

test("published schemas are json and pin independent contract versions", () => {
  for (const [name, schema] of Object.entries(protocolSchemas)) {
    expect(roundTripJson(schema)).toMatchObject({
      $id: `urn:independum:component-protocol:${name}:1.0`,
      $schema: "https://json-schema.org/draft/2020-12/schema",
    });
  }
  expect(Object.keys(operationInputs)).toEqual(referenceOperations);
  expect(Object.keys(operationOutputs)).toEqual(referenceOperations);
  expect(Object.keys(referenceContracts)).toHaveLength(12);
  validateValue(protocolSchemas.manifest as TSchema, referenceManifest);
  expect(() =>
    validateValue(protocolSchemas.manifest as TSchema, {
      ...(referenceManifest as Record<string, JsonValue>),
      manifestVersion: { major: 2, minor: 0 },
    }),
  ).toThrow();
  validateValue(protocolSchemas.toolDefinition as TSchema, referenceTool);
  validateValue(operationInputs.initialize, referenceOffer());
});

test("json round trips preserve all supported values and detach references", () => {
  const original = {
    text: "\u2603\n",
    boolean: false,
    empty: null,
    fraction: 1.25,
    array: [{ value: 1 }],
  };
  const copy = roundTripJson(original);
  expect(copy).toEqual(original);
  original.array[0] = { value: 7 };
  expect(copy).not.toEqual(original);
});

test.for([
  { label: "undefined", value: undefined },
  { label: "not a number", value: Number.NaN },
  { label: "infinity", value: Number.POSITIVE_INFINITY },
  { label: "negative zero", value: -0 },
  { label: "big integers", value: 1n },
  { label: "functions", value: () => {} },
  { label: "dates", value: new Date() },
  { label: "typed arrays", value: new Uint8Array([1]) },
  { label: "undefined fields", value: { missing: undefined } },
  { label: "undefined entries", value: [undefined] },
  { label: "sparse arrays", value: new Array(2) },
  { label: "symbols", value: { [Symbol("hidden")]: 1 } },
])("json round trips reject $label", ({ value }) => {
  expect(() => roundTripJson(value)).toThrow();
});

test("json round trips reject cycles and getters without executing them", () => {
  const cycle: unknown[] = [];
  cycle.push(cycle);
  expect(() => roundTripJson(cycle)).toThrow();
  let hasRead = false;
  expect(() =>
    roundTripJson({
      get value() {
        hasRead = true;
        return 1;
      },
    }),
  ).toThrow();
  expect(hasRead).toBe(false);
});

test("json rejects inherited serialization and custom arrays before copying", () => {
  let calls = 0;
  const prototype = Object.create(Array.prototype) as object;
  Object.defineProperty(prototype, "toJSON", {
    value: () => {
      calls++;
      return [calls];
    },
  });
  const array = [1];
  Object.setPrototypeOf(array, prototype);
  for (const value of [array, Object.create({ value: 1 }), new Proxy({ value: 1 }, {})]) {
    expect(() => roundTripJson(value)).toThrow();
    expect(() => equalJson(value, value)).toThrow();
  }
  expect(calls).toBe(0);
});

test("json equality ignores nested object order and preserves array order and types", () => {
  expect(equalJson({ a: [{ b: 2, a: 1 }], b: null }, { b: null, a: [{ a: 1, b: 2 }] })).toBe(true);
  for (const [left, right] of [
    [[], {}],
    [
      [1, 2],
      [2, 1],
    ],
    [1, "1"],
    [{ a: null }, {}],
  ]) {
    expect(equalJson(left, right)).toBe(false);
  }
  const ordinary = JSON.parse('{"toJSON":"ordinary field","__proto__":null}');
  expect(roundTripJson(ordinary)).toEqual(ordinary);
});

test("negotiation selects compatible minors and rejects incompatible majors", () => {
  expect(negotiateVersion([{ major: 1, minor: 8 }], [{ major: 1, minor: 2 }])).toEqual({
    major: 1,
    minor: 2,
  });
  expect(() => negotiateVersion([{ major: 2, minor: 0 }], [{ major: 1, minor: 9 }])).toThrow();
});

test("invocations require every captured identity field and an explicit deadline", () => {
  const identity = referenceIdentity("identity");
  for (const key of Object.keys(identity)) {
    const incomplete = { ...identity };
    Reflect.deleteProperty(incomplete, key);
    expect(() => validateValue(protocolSchemas.identity as TSchema, incomplete)).toThrow();
  }
  expect(() =>
    validateValue(protocolSchemas.identity as TSchema, { ...identity, deadline: "later" }),
  ).toThrow();
});

test("blob references pin broker identity digest size media access and retention", () => {
  const blob = {
    id: "blob-1",
    brokerId: "broker",
    digest: referenceDigest,
    size: 5_000_000,
    mediaType: "application/octet-stream",
    access: ["read"],
    retentionId: "record-1",
  };
  validateValue(protocolSchemas.blob as TSchema, blob);
  for (const change of [
    { access: ["execute"] },
    { digest: "unverified" },
    { size: -1 },
    { bytes: "inline" },
  ]) {
    expect(() => validateValue(protocolSchemas.blob as TSchema, { ...blob, ...change })).toThrow();
  }
});

test("kernel evidence distinguishes explicit absence and incomplete capture from success", () => {
  validateValue(protocolSchemas.capturedValue as TSchema, {
    isPresent: false,
    reason: "Dispatch does not occur.",
  });
  expect(() => validateValue(protocolSchemas.capturedValue as TSchema, null)).toThrow();
  const complete = { isComplete: true, missing: [] };
  const coverage = {
    input: complete,
    attempts: complete,
    rawOutput: complete,
    normalizedOutput: complete,
    blobs: complete,
    predecessors: complete,
  };
  validateValue(protocolSchemas.completeness as TSchema, coverage);
  expect(() =>
    validateValue(protocolSchemas.completeness as TSchema, {
      ...coverage,
      attempts: { isComplete: false, missing: [] },
    }),
  ).toThrow();
  validateValue(protocolSchemas.completeness as TSchema, {
    ...coverage,
    attempts: {
      isComplete: false,
      missing: [{ portion: "attempt-1", reason: "The transport is not observed." }],
    },
  });
});

test.each([
  "invalid-input",
  "missing-dependency",
  "denied-authority",
  "execution-failure",
  "cancellation",
  "protocol-failure",
])("structured error kind %s preserves identity locations wording and delivery facts", (kind) => {
  validateValue(protocolSchemas.failure as TSchema, {
    kind,
    identity: referenceIdentity("failure"),
    contract: { id: "tool.execute", version: { major: 1, minor: 0 } },
    sequence: 1,
    locations: [{ pointer: "/arguments/count", reason: "An integer is required." }],
    text: { id: "tool.failure", values: { reason: "fixture" } },
    dispatch: "known",
    effects: "uncertain",
  });
});

function variants(value: JsonValue, depth = 2): JsonValue[] {
  if (value === null || typeof value !== "object" || depth === 0) {
    return [value];
  }
  const replacements: JsonValue[] = [null, "text", 1, -1, 1.5, true, [], {}];
  const results: JsonValue[] = [value, ...replacements];
  const entries = Object.entries(value);
  for (const [key, entry] of entries) {
    for (const replacement of [...variants(entry, depth - 1).slice(1), ...replacements]) {
      results.push(
        Array.isArray(value)
          ? value.map((current, index) => (String(index) === key ? replacement : current))
          : { ...value, [key]: replacement },
      );
    }
    if (!Array.isArray(value)) {
      results.push(Object.fromEntries(entries.filter(([other]) => other !== key)));
    }
  }
  results.push(Array.isArray(value) ? [...value, "extra"] : { ...value, extra: true });
  return results;
}

test("published validators agree with the typebox interpreter on generated variants", () => {
  const samples = operationSamples();
  const identity = roundTripJson(referenceIdentity("variant"));
  const contract = { id: "tool.execute", version: { major: 1, minor: 0 } };
  const failure: JsonValue = {
    kind: "execution-failure",
    identity,
    contract,
    sequence: 1,
    locations: [],
    text: null,
    dispatch: "known",
    effects: "uncertain",
  };
  const frames: JsonValue[] = [
    {
      jsonrpc: "2.0",
      id: "broker:1",
      method: "tool.execute",
      params: {
        wireVersion: { major: 1, minor: 0 },
        identity,
        contract,
        sequence: 1,
        capabilities: ["fixture.read"],
        input: samples.inputs["tool.execute"],
      },
    },
    {
      jsonrpc: "2.0",
      method: "progress",
      params: { wireVersion: { major: 1, minor: 0 }, identity, contract, sequence: 2, data: {} },
    },
    {
      jsonrpc: "2.0",
      id: "broker:1",
      result: { identity, contract, sequence: 3, outcome: "completed", output: null },
    },
    { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Failure.", data: failure } },
  ];
  const cases: [TSchema, JsonValue][] = [
    ...referenceOperations.flatMap((operation): [TSchema, JsonValue][] => [
      [operationInputs[operation], samples.inputs[operation]],
      [operationOutputs[operation], samples.outputs[operation]],
    ]),
    ...frames.map((frame): [TSchema, JsonValue] => [protocolSchemas.frame as TSchema, frame]),
    [protocolSchemas.failure as TSchema, failure],
  ];
  let checked = 0;
  for (const [schema, sample] of cases) {
    for (const variant of variants(roundTripJson(sample))) {
      let isValid = true;
      try {
        validateValue(schema, variant);
      } catch {
        isValid = false;
      }
      expect(isValid, JSON.stringify(variant)).toBe(Value.Check(schema, variant));
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(1000);
});
