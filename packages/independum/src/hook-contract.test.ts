import { expect, test } from "vitest";
import { validateProfileBundle } from "./configuration-schema.ts";
import {
  hookModelTexts,
  readHookOutput,
  readScriptHooks,
  type ScriptHook,
  validateHookConfiguration,
} from "./hook-contract.ts";

const hook: ScriptHook = {
  id: "guard",
  event: "tool_call",
  mode: "transform",
  run: { command: ["python", "guard.py"], workingDirectory: "source" },
};

test("rejects unknown definitions duplicate ids invalid limits and unsupported filters", () => {
  for (const entry of [
    { ...hook, unknown: true },
    { ...hook, timeoutMs: 0 },
    { ...hook, inputLimitBytes: null },
    { ...hook, event: "before_provider_headers" },
    { ...hook, event: "context", match: { toolNames: ["Read"] } },
    { ...hook, run: { command: [], workingDirectory: "source" } },
  ]) {
    expect(() => readScriptHooks([entry])).toThrow();
  }
  expect(() => readScriptHooks([hook, hook])).toThrow("unique");
  expect(readScriptHooks([{ ...hook, timeoutMs: null }])[0]?.timeoutMs).toBeNull();
});

test("order includes every configured hook including disabled hooks", () => {
  const configuration = {
    hooks: [hook],
    disabledHooks: [hook.id],
    hookOrder: { [hook.event]: [hook.id] },
  };
  expect(() => validateHookConfiguration(configuration)).not.toThrow();
  expect(() =>
    validateHookConfiguration({ ...configuration, hookOrder: { [hook.event]: [] } }),
  ).toThrow("exactly once");
  expect(() => validateHookConfiguration({ ...configuration, disabledHooks: ["unknown"] })).toThrow(
    "configured",
  );
});

test("observers reject effects and every event rejects unsupported fields", () => {
  expect(() =>
    readHookOutput(
      { apiVersion: 1, action: "replace", replacement: { input: {} } },
      { ...hook, mode: "observe" },
    ),
  ).toThrow("Observation");
  expect(() =>
    readHookOutput({ apiVersion: 1, action: "continue", replacement: {} }, hook),
  ).toThrow("Only replace");
  expect(() =>
    readHookOutput({ apiVersion: 1, action: "block", reason: { id: "unknown", values: {} } }, hook),
  ).toThrow("declared");
  expect(() =>
    readHookOutput(
      { apiVersion: 1, action: "replace", replacement: { input: {}, command: "extra" } },
      hook,
    ),
  ).toThrow("supported fields");
});

test("inline model texts keep their identities and profile edits validate against them", () => {
  const declared = {
    ...hook,
    texts: { blocked: { label: "Blocked", builtIn: "Blocked.", slots: {} } },
  };
  const texts = hookModelTexts([declared]);
  expect(texts[0]).toMatchObject({
    id: "hook.guard.blocked",
    group: "Hook guard",
    builtIn: "Blocked.",
  });
  const bundle = {
    profile: { formatVersion: 1, name: "Hooks", settings: { hooks: [declared] } },
    systemPrompt: null,
    modelTexts: {
      formatVersion: 1,
      texts: { "hook.guard.blocked": { text: "Edited.", builtIn: "Blocked." } },
    },
  };
  expect(() => validateProfileBundle(bundle, "profile")).not.toThrow();
  expect(() =>
    validateProfileBundle(
      { ...bundle, profile: { ...bundle.profile, settings: { hooks: [] } } },
      "profile",
    ),
  ).toThrow("not registered");
});

test("context and tool result replacements require complete event shapes", () => {
  const result = { ...hook, event: "tool_result" as const };
  expect(() =>
    readHookOutput({ apiVersion: 1, action: "replace", replacement: { content: [] } }, result),
  ).toThrow("every field");
  expect(() =>
    readHookOutput(
      {
        apiVersion: 1,
        action: "replace",
        replacement: { messages: [{ role: "system", content: "prompt" }] },
      },
      { ...hook, event: "context" },
    ),
  ).toThrow("Ordinary context");
  expect(() =>
    readHookOutput(
      { apiVersion: 1, action: "replace", replacement: { messages: [{ role: "unknown" }] } },
      { ...hook, event: "context_with_system" },
    ),
  ).toThrow("supported Pi messages");
});
