import { join } from "node:path";
import { expect, test, vi } from "vitest";
import {
  createScriptHooks,
  type ScriptHooksOptions,
  type ScriptResult,
} from "./create-script-hooks.ts";
import { type HookEvent, hookEvents, type ScriptHook } from "./hook-contract.ts";
import { createModelTexts } from "./model-texts.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";

const parent = createTestFolder("script-hooks");

function hook(id = "first", event: HookEvent = "before_provider_request"): ScriptHook {
  return {
    id,
    event,
    mode: "transform",
    run: { command: [process.execPath, "hook.ts"], workingDirectory: "source" },
  };
}

function success(value: unknown = { apiVersion: 1, action: "continue" }): ScriptResult {
  return { output: JSON.stringify(value), error: "diagnostic", exitCode: 0 };
}

function fixture(hooks: ScriptHook[] = [hook()]): ScriptHooksOptions {
  const { directory, project } = createTestProject(parent);
  return {
    configuration: { hooks, disabledHooks: [], hookOrder: {} },
    revision: "profile-revision",
    source: directory,
    outputFolder: join(directory, "outputs"),
    chatId: "chat",
    projectFolder: project,
    texts: createModelTexts(() => ({})),
    leaf: () => "leaf",
    model: () => null,
    execute: vi.fn(async () => success()),
    validateInput: vi.fn(),
    onChange: vi.fn(),
  };
}

function replacement(event: HookEvent): Record<string, unknown> {
  if (event === "input") {
    return { text: "changed", images: [] };
  }
  if (event === "before_agent_start") {
    return { systemPrompt: "changed" };
  }
  if (event === "tool_call") {
    return { input: { path: "changed" } };
  }
  if (event === "tool_result") {
    return {
      content: [{ type: "text", text: "changed" }],
      structuredContent: null,
      details: null,
      isError: false,
      usage: null,
    };
  }
  if (event === "before_provider_request") {
    return { changed: true };
  }
  return { messages: [{ role: "user", content: "changed", timestamp: 1 }] };
}

test.each(hookEvents)("accepts a validated replacement for %s", async (event) => {
  const options = fixture([hook("first", event)]);
  options.execute = vi.fn(async () =>
    success({ apiVersion: 1, action: "replace", replacement: replacement(event) }),
  );
  const runtime = createScriptHooks(options);
  const original = {
    toolName: "Read",
    input: { path: "original" },
    payload: { original: true },
    usage: { totalTokens: 12 },
  };
  const result = await runtime.dispatch(event, original);
  expect(result.data).toMatchObject(
    event === "before_provider_request"
      ? { payload: replacement(event) }
      : event === "tool_result"
        ? { ...replacement(event), usage: original.usage }
        : replacement(event),
  );
  expect(original.input.path).toBe("original");
  expect(runtime.summary().invocations[0]).toMatchObject({
    status: "succeeded",
    exitCode: 0,
    stderr: "diagnostic",
    generation: 1,
    input: { event, chatId: "chat", leafId: "leaf", settings: {}, apiVersion: 1 },
  });
});

test("runs hooks sequentially in explicit order and passes accepted values", async () => {
  const options = fixture([hook("first"), hook("second"), hook("disabled")]);
  options.configuration.hookOrder.before_provider_request = ["second", "disabled", "first"];
  options.configuration.disabledHooks = ["disabled"];
  const inputs: unknown[] = [];
  options.execute = vi.fn(async (_hook, input) => {
    inputs.push(input.data.payload);
    return success({
      apiVersion: 1,
      action: "replace",
      replacement: { previous: input.data.payload, from: input.hookId },
    });
  });
  const runtime = createScriptHooks(options);
  await runtime.dispatch("before_provider_request", { payload: { original: true } });
  expect(inputs).toEqual([{ original: true }, { previous: { original: true }, from: "second" }]);
  expect(runtime.summary().invocations.map((record) => record.hookId)).toEqual(["second", "first"]);
});

test("observation failures continue by default and transforming failures stop", async () => {
  const observer = { ...hook(), mode: "observe" as const };
  const options = fixture([observer, hook("second")]);
  options.execute = vi.fn(async (hook) =>
    hook.id === "first"
      ? { output: "not JSON", error: "private diagnostic", exitCode: 2 }
      : success(),
  );
  const runtime = createScriptHooks(options);
  await runtime.dispatch("before_provider_request", { payload: {} });
  expect(runtime.summary().invocations.map((record) => record.status)).toEqual([
    "failed",
    "succeeded",
  ]);
  const stopping = fixture([hook(), hook("second")]);
  stopping.execute = options.execute;
  const stopped = createScriptHooks(stopping);
  await expect(stopped.dispatch("before_provider_request", { payload: {} })).rejects.toThrow(
    "Hook first stopped",
  );
  expect(stopped.summary().invocations.map((record) => record.status)).toEqual([
    "failed",
    "skipped",
  ]);
  expect(() => stopped.guard()).toThrow("execution or validation failure");
  expect(() => stopped.guard()).not.toThrow("private diagnostic");
});

test("explicit continue retains the preceding event value after an invalid effect", async () => {
  const options = fixture([{ ...hook(), onError: "continue" }, hook("second")]);
  const inputs: unknown[] = [];
  options.execute = vi.fn(async (_hook, input) => {
    inputs.push(input.data.payload);
    return input.hookId === "first"
      ? success({ apiVersion: 1, action: "replace", replacement: [] })
      : success();
  });
  const runtime = createScriptHooks(options);
  expect(
    (await runtime.dispatch("before_provider_request", { payload: { original: true } })).data
      .payload,
  ).toEqual({ original: true });
  expect(inputs).toEqual([{ original: true }, { original: true }]);
});

test("a declared tool block skips successors without failing the reply", async () => {
  const first = hook("first", "tool_call");
  first.texts = {
    blocked: {
      label: "Blocked",
      builtIn: "Blocked {path}.",
      slots: { path: { meaning: "The target.", example: "file" } },
    },
  };
  const options = fixture([first, hook("second", "tool_call")]);
  options.texts = createModelTexts(() => ({ "hook.first.blocked": { text: "Edited {path}." } }));
  options.execute = vi.fn(async () =>
    success({
      apiVersion: 1,
      action: "block",
      reason: { id: "blocked", values: { path: "secret" } },
    }),
  );
  const runtime = createScriptHooks(options);
  expect((await runtime.dispatch("tool_call", { toolName: "Read", input: {} })).blocked).toBe(
    "Edited secret.",
  );
  expect(runtime.summary().invocations.map((record) => record.status)).toEqual([
    "succeeded",
    "skipped",
  ]);
  expect(() => runtime.guard()).not.toThrow();
});

test("exact tool filters distinguish an omitted filter from an empty filter", async () => {
  const options = fixture([
    { ...hook("empty", "tool_call"), match: { toolNames: [] } },
    { ...hook("exact", "tool_call"), match: { toolNames: ["read"] } },
    hook("all", "tool_call"),
  ]);
  const runtime = createScriptHooks(options);
  await runtime.dispatch("tool_call", { toolName: "Read", input: {} });
  expect(runtime.summary().invocations.map((record) => record.hookId)).toEqual(["all"]);
});

test("invalid rewritten arguments never become accepted input", async () => {
  const options = fixture([hook("first", "tool_call")]);
  options.execute = vi.fn(async () =>
    success({ apiVersion: 1, action: "replace", replacement: { input: { path: 5 } } }),
  );
  function rejectInput(): void {
    throw new Error("Invalid tool input.");
  }
  options.validateInput = rejectInput;
  const runtime = createScriptHooks(options);
  await expect(
    runtime.dispatch("tool_call", { toolName: "Read", input: { path: "original" } }),
  ).rejects.toThrow();
  expect(runtime.summary().invocations[0]?.accepted).toBeNull();
});

test.each([
  "",
  "{} {}",
  "{",
  '{"apiVersion":2,"action":"continue"}',
  '{"apiVersion":1,"action":"continue","unexpected":true}',
])("rejects invalid script response %s", async (output) => {
  const options = fixture();
  options.execute = vi.fn(async () => ({ output, error: "", exitCode: 0 }));
  const runtime = createScriptHooks(options);
  await expect(runtime.dispatch("before_provider_request", { payload: {} })).rejects.toThrow();
  expect(runtime.summary().invocations[0]?.status).toBe("failed");
});

test("input byte limits prevent launch and records survive reconnect", async () => {
  const options = fixture([{ ...hook(), inputLimitBytes: 1 }]);
  const runtime = createScriptHooks(options);
  await expect(runtime.dispatch("before_provider_request", { payload: {} })).rejects.toThrow();
  expect(options.execute).not.toHaveBeenCalled();
  const reopened = createScriptHooks(options);
  expect(reopened.summary().invocations[0]).toMatchObject({
    status: "failed",
    error: "The hook input exceeds its byte limit.",
  });
});

test("reload waits for cancellation and late output cannot change the event", async () => {
  const options = fixture([{ ...hook(), onError: "continue" }]);
  let finish: ((result: ScriptResult) => void) | undefined;
  options.execute = vi.fn(
    () =>
      new Promise<ScriptResult>((resolve) => {
        finish = resolve;
      }),
  );
  const runtime = createScriptHooks(options);
  const pending = runtime.dispatch("before_provider_request", { payload: { original: true } });
  expect(() => runtime.reload()).toThrow("Stop the running hooks");
  expect(runtime.stop()).toBe(true);
  finish?.(success({ apiVersion: 1, action: "replace", replacement: { late: true } }));
  await expect(pending).rejects.toThrow("cancelled");
  expect(runtime.summary().invocations[0]).toMatchObject({ status: "cancelled", accepted: null });
  runtime.reload();
  expect(runtime.summary().generation).toBe(2);
});

test("source fingerprints survive reopening and explicit reload clears them durably", () => {
  const options = fixture();
  options.fingerprints = new Map([["entry.ts", "first fingerprint"]]);
  const runtime = createScriptHooks(options);
  runtime.saveSources();
  const reopened = { ...options, fingerprints: new Map<string, string>() };
  const loaded = createScriptHooks(reopened);
  expect(reopened.fingerprints.get("entry.ts")).toBe("first fingerprint");
  loaded.reload();
  const next = { ...options, fingerprints: new Map<string, string>() };
  createScriptHooks(next);
  expect(next.fingerprints.size).toBe(0);
});
