import type { ModelText } from "./model-texts.ts";

export const hookEvents = [
  "input",
  "before_agent_start",
  "context",
  "context_with_system",
  "before_provider_request",
  "tool_call",
  "tool_result",
] as const;

export type HookEvent = (typeof hookEvents)[number];

/** A script and the effects that its event permits. */
export interface ScriptHook {
  id: string;
  event: HookEvent;
  mode: "observe" | "transform";
  run: { command: string[]; workingDirectory: "source" | "project" };
  match?: { toolNames: string[] };
  timeoutMs?: number | null;
  inputLimitBytes?: number;
  outputLimitBytes?: number;
  errorLimitBytes?: number;
  onError?: "stop" | "continue";
  texts?: Record<string, Pick<ModelText, "label" | "builtIn" | "slots">>;
}

/** Profile-owned script hooks and their explicit order and switches. */
export interface HookConfiguration {
  hooks: ScriptHook[];
  disabledHooks: string[];
  hookOrder: Partial<Record<HookEvent, string[]>>;
}

/** One versioned script input without authentication or environment state. */
export interface HookInput {
  apiVersion: 1;
  invocationId: string;
  eventId: string;
  event: HookEvent;
  hookId: string;
  chatId: string;
  leafId: string | null;
  projectFolder: string;
  startedAt: string;
  deadlineAt: string | null;
  model: { providerId: string; id: string; thinkingLevel: string } | null;
  settings: Record<string, never>;
  data: Record<string, unknown>;
}

/** The complete response of a script invocation. */
export interface HookOutput {
  apiVersion: 1;
  action: "continue" | "replace" | "block";
  replacement?: unknown;
  reason?: { id: string; values: Record<string, string | number> };
}

/** Durable evidence for one hook, including successors skipped by a stopped chain. */
export interface HookInvocation {
  id: string;
  hookId: string;
  event: HookEvent;
  eventId: string;
  generation: number;
  revision: string;
  status: "running" | "succeeded" | "failed" | "cancelled" | "skipped";
  input: HookInput;
  output: HookOutput | null;
  accepted: Record<string, unknown> | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  error: string | null;
}

/** The effective hook configuration and its most recent execution evidence. */
export interface HookSummary extends HookConfiguration {
  generation: number;
  revision: string;
  source: string;
  invocations: HookInvocation[];
}

/** Returns registered inline model texts with stable identities. */
export function hookModelTexts(hooks: ScriptHook[]): ModelText[] {
  return hooks.flatMap((hook) =>
    Object.entries(hook.texts ?? {}).map(([id, text]) => ({
      ...text,
      id: `hook.${hook.id}.${id}`,
      group: `Hook ${hook.id}`,
      section: "result" as const,
    })),
  );
}

/** Validates script definitions without importing or executing user code. */
export function readScriptHooks(value: unknown): ScriptHook[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected an array of script hooks.");
  }
  const ids = new Set<string>();
  for (const entry of value) {
    const hook = objectOf(entry, [
      "id",
      "event",
      "mode",
      "run",
      "match",
      "timeoutMs",
      "inputLimitBytes",
      "outputLimitBytes",
      "errorLimitBytes",
      "onError",
      "texts",
    ]);
    if (typeof hook.id !== "string" || !/^[a-z][a-zA-Z0-9]*$/.test(hook.id) || ids.has(hook.id)) {
      throw new Error(
        "Hook ids must be unique and start with a lowercase letter, followed by letters or digits.",
      );
    }
    ids.add(hook.id);
    if (
      !hookEvents.some((event) => event === hook.event) ||
      !["observe", "transform"].includes(String(hook.mode))
    ) {
      throw new Error("Expected a supported hook event and observe or transform mode.");
    }
    const run = objectOf(hook.run, ["command", "workingDirectory"]);
    if (
      !Array.isArray(run.command) ||
      run.command.length === 0 ||
      run.command.some((part) => typeof part !== "string" || part.includes("\0")) ||
      run.command[0] === "" ||
      !["source", "project"].includes(String(run.workingDirectory))
    ) {
      throw new Error(
        "A script needs a nonempty executable argument array and a source or project working directory.",
      );
    }
    if (hook.match !== undefined) {
      const match = objectOf(hook.match, ["toolNames"]);
      if (
        !["tool_call", "tool_result"].includes(String(hook.event)) ||
        !stringList(match.toolNames)
      ) {
        throw new Error("Only tool events accept exact toolNames filters.");
      }
    }
    for (const key of ["timeoutMs", "inputLimitBytes", "outputLimitBytes", "errorLimitBytes"]) {
      if (
        hook[key] !== undefined &&
        !(key === "timeoutMs" && hook[key] === null) &&
        (!Number.isSafeInteger(hook[key]) || Number(hook[key]) <= 0)
      ) {
        throw new Error("Hook limits must be positive integers. Only timeoutMs accepts null.");
      }
    }
    if (hook.onError !== undefined && !["stop", "continue"].includes(String(hook.onError))) {
      throw new Error("Hook onError must be stop or continue.");
    }
    if (hook.texts !== undefined) {
      for (const [id, entry] of Object.entries(objectOf(hook.texts))) {
        const text = objectOf(entry, ["label", "builtIn", "slots"]);
        if (
          !/^[a-z][a-zA-Z0-9]*$/.test(id) ||
          typeof text.label !== "string" ||
          typeof text.builtIn !== "string"
        ) {
          throw new Error("A hook model text needs a local id, label, builtIn text, and slots.");
        }
        for (const entry of Object.values(objectOf(text.slots))) {
          const slot = objectOf(entry, ["meaning", "example"]);
          if (typeof slot.meaning !== "string" || typeof slot.example !== "string") {
            throw new Error("A text slot needs a meaning and example.");
          }
        }
      }
    }
  }
  return structuredClone(value) as ScriptHook[];
}

/** Checks the entire profile order, including disabled hooks. */
export function validateHookConfiguration(configuration: HookConfiguration): void {
  readScriptHooks(configuration.hooks);
  if (
    !stringList(configuration.disabledHooks) ||
    configuration.disabledHooks.some((id) => !configuration.hooks.some((hook) => hook.id === id))
  ) {
    throw new Error("Disabled hooks must name configured hooks without duplicates.");
  }
  for (const [event, order] of Object.entries(objectOf(configuration.hookOrder))) {
    const hooks = configuration.hooks.filter((hook) => hook.event === event);
    if (
      !hookEvents.some((registered) => registered === event) ||
      !stringList(order) ||
      order.length !== hooks.length ||
      hooks.some((hook) => !order.includes(hook.id))
    ) {
      throw new Error(
        "Each explicit hook order must name every hook of its event exactly once, including disabled hooks.",
      );
    }
  }
}

/** Validates exact effects before any event or operation changes. */
export function readHookOutput(value: unknown, hook: ScriptHook): HookOutput {
  const output = objectOf(value, ["apiVersion", "action", "replacement", "reason"]);
  if (
    output.apiVersion !== 1 ||
    !["continue", "replace", "block"].includes(String(output.action))
  ) {
    throw new Error("Expected hook API version 1 and a supported action.");
  }
  if (hook.mode === "observe" && output.action !== "continue") {
    throw new Error("Observation hooks accept only continue.");
  }
  if (output.action !== "replace" && Object.hasOwn(output, "replacement")) {
    throw new Error("Only replace accepts a replacement.");
  }
  if (output.action !== "block" && Object.hasOwn(output, "reason")) {
    throw new Error("Only block accepts a reason.");
  }
  if (output.action === "block") {
    if (!["input", "before_provider_request", "tool_call"].includes(hook.event)) {
      throw new Error("This event cannot block.");
    }
    const reason = objectOf(output.reason, ["id", "values"]);
    const text = typeof reason.id === "string" ? hook.texts?.[reason.id] : undefined;
    const values = objectOf(reason.values);
    if (
      text === undefined ||
      Object.keys(values).some((name) => !Object.hasOwn(text.slots, name)) ||
      Object.keys(text.slots).some((name) => !Object.hasOwn(values, name)) ||
      Object.values(values).some(
        (value) =>
          typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value)),
      )
    ) {
      throw new Error("A block needs a declared model text and exactly its slot values.");
    }
  }
  if (output.action === "replace") {
    if (hook.event === "before_provider_request") {
      objectOf(output.replacement);
    } else {
      const fields =
        hook.event === "input"
          ? ["text", "images"]
          : hook.event === "before_agent_start"
            ? ["systemPrompt"]
            : hook.event === "tool_call"
              ? ["input"]
              : hook.event === "tool_result"
                ? ["content", "structuredContent", "details", "isError", "usage"]
                : ["messages"];
      const replacement = objectOf(output.replacement, fields);
      if (fields.some((field) => !Object.hasOwn(replacement, field))) {
        throw new Error("A replacement must supply every field of its event result.");
      }
      if (
        hook.event === "input" &&
        (typeof replacement.text !== "string" ||
          !Array.isArray(replacement.images) ||
          !replacement.images.every(isImage))
      ) {
        throw new Error("Input replacement needs text and an array of images.");
      }
      if (hook.event === "before_agent_start" && typeof replacement.systemPrompt !== "string") {
        throw new Error("Prompt replacement needs systemPrompt text.");
      }
      if (hook.event === "tool_call") {
        objectOf(replacement.input);
      }
      if (hook.event === "context" || hook.event === "context_with_system") {
        if (
          !Array.isArray(replacement.messages) ||
          !replacement.messages.every((message) =>
            isHookMessage(message, hook.event === "context_with_system"),
          )
        ) {
          throw new Error(
            "Context replacement needs supported Pi messages. Ordinary context cannot supply system messages.",
          );
        }
      }
      if (
        hook.event === "tool_result" &&
        (!Array.isArray(replacement.content) ||
          !replacement.content.every(
            (block) =>
              isImage(block) ||
              (typeof block === "object" &&
                block !== null &&
                "type" in block &&
                block.type === "text" &&
                "text" in block &&
                typeof block.text === "string"),
          ) ||
          typeof replacement.isError !== "boolean")
      ) {
        throw new Error("Tool result replacement needs text or image content and an error flag.");
      }
    }
  }
  return value as HookOutput;
}

function objectOf(value: unknown, keys?: string[]): Record<string, unknown> {
  const object =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  if (object === undefined) {
    throw new Error("Expected an object with only supported fields.");
  }
  if (keys !== undefined) {
    for (const key of Object.keys(object)) {
      if (!keys.includes(key)) {
        throw new Error("Expected an object with only supported fields.");
      }
    }
  }
  return object;
}

function stringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string") &&
    new Set(value).size === value.length
  );
}

function isImage(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "image" &&
    "data" in value &&
    typeof value.data === "string" &&
    "mimeType" in value &&
    typeof value.mimeType === "string"
  );
}

function isHookMessage(value: unknown, hasSystem: boolean): boolean {
  const message = objectOf(value);
  if (typeof message.timestamp !== "number" || !Number.isFinite(message.timestamp)) {
    return false;
  }
  if (message.role === "branchSummary" || message.role === "compactionSummary") {
    return (
      typeof message.summary === "string" &&
      (message.role === "branchSummary"
        ? message.fromId === null || typeof message.fromId === "string"
        : typeof message.tokensBefore === "number" && Number.isFinite(message.tokensBefore))
    );
  }
  if (message.role === "bashExecution") {
    return (
      typeof message.command === "string" &&
      typeof message.output === "string" &&
      typeof message.cancelled === "boolean" &&
      typeof message.truncated === "boolean" &&
      (message.exitCode === undefined || typeof message.exitCode === "number")
    );
  }
  if (message.role === "assistant") {
    return (
      ["api", "provider", "model", "stopReason"].every(
        (field) => typeof message[field] === "string",
      ) &&
      ["stop", "length", "toolUse", "error", "aborted"].includes(String(message.stopReason)) &&
      isUsage(message.usage) &&
      Array.isArray(message.content) &&
      message.content.every((entry) => {
        const block = objectOf(entry);
        return (
          isText(block) ||
          (block.type === "thinking" && typeof block.thinking === "string") ||
          (block.type === "toolCall" &&
            typeof block.id === "string" &&
            typeof block.name === "string" &&
            typeof block.arguments === "object" &&
            block.arguments !== null &&
            !Array.isArray(block.arguments))
        );
      })
    );
  }
  if (message.role === "system") {
    if (!hasSystem || !textContent(message.content, false)) {
      return false;
    }
    if (
      message.sections !== undefined &&
      !Object.values(objectOf(message.sections)).every(
        (section) => section === null || typeof section === "string",
      )
    ) {
      return false;
    }
    for (const field of ["toolsAdded", "toolsRemoved"]) {
      if (
        message[field] !== undefined &&
        (!Array.isArray(message[field]) ||
          !(message[field] as unknown[]).every((tool) => {
            const fields = objectOf(tool);
            return (
              typeof fields.name === "string" &&
              (field === "toolsRemoved" ||
                (typeof fields.description === "string" &&
                  typeof fields.parameters === "object" &&
                  fields.parameters !== null))
            );
          }))
      ) {
        return false;
      }
    }
    return true;
  }
  if (message.role === "toolResult") {
    return (
      typeof message.toolName === "string" &&
      typeof message.toolCallId === "string" &&
      typeof message.isError === "boolean" &&
      Array.isArray(message.content) &&
      textContent(message.content, true) &&
      (message.usage === undefined || isUsage(message.usage))
    );
  }
  return (
    (message.role === "user" ||
      (message.role === "custom" &&
        typeof message.customType === "string" &&
        typeof message.display === "boolean")) &&
    textContent(message.content, true)
  );
}

function textContent(value: unknown, hasImages: boolean): boolean {
  return (
    typeof value === "string" ||
    (Array.isArray(value) && value.every((block) => isText(block) || (hasImages && isImage(block))))
  );
}

function isText(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "text" &&
    "text" in value &&
    typeof value.text === "string"
  );
}

function isUsage(value: unknown): boolean {
  const usage = objectOf(value);
  return (
    ["input", "output", "cacheRead", "cacheWrite", "totalTokens"].every(
      (field) => typeof usage[field] === "number" && Number.isFinite(usage[field]),
    ) &&
    Object.values(objectOf(usage.cost)).every(
      (cost) => typeof cost === "number" && Number.isFinite(cost),
    )
  );
}
