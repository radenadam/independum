import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  HookConfiguration,
  HookEvent,
  HookInput,
  HookInvocation,
  HookSummary,
  ScriptHook,
} from "./hook-contract.ts";
import { readHookOutput, validateHookConfiguration } from "./hook-contract.ts";
import { hookFailureText } from "./hook-texts.ts";
import type { ModelTexts } from "./model-texts.ts";

/** The captured process result, including a failed deadline or byte limit. */
export interface ScriptResult {
  output: string;
  error: string;
  exitCode: number;
  failure?: string;
}

/** Immutable dependencies of one profile's hook generation. */
export interface ScriptHooksOptions {
  fingerprints?: Map<string, string>;
  configuration: HookConfiguration;
  revision: string;
  source: string;
  outputFolder: string;
  chatId: string;
  projectFolder: string;
  texts: ModelTexts;
  leaf: () => string | null;
  model: () => HookInput["model"];
  execute: (hook: ScriptHook, input: HookInput, signal: AbortSignal) => Promise<ScriptResult>;
  validateInput: (name: string, input: unknown) => void;
  onChange: () => void;
}

/** Ordered script hooks with durable evidence and cancellation owned by one chat. */
export interface ScriptHooks {
  dispatch(
    event: HookEvent,
    data: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ data: Record<string, unknown>; blocked?: string }>;
  summary(): HookSummary;
  stop(id?: string): boolean;
  reload(): void;
  saveSources(): void;
  guard(): void;
  reset(): void;
}

/** Runs each accepted effect before invoking the next script. */
export function createScriptHooks(options: ScriptHooksOptions): ScriptHooks {
  validateHookConfiguration(options.configuration);
  const configuration = structuredClone(options.configuration);
  const folder = join(options.outputFolder, options.chatId, "hooks");
  const running = new Map<string, AbortController>();
  let generation = 1;
  let stopped: string | undefined;
  const sources = join(folder, "sources.json");
  if (options.fingerprints !== undefined && existsSync(sources)) {
    const saved = JSON.parse(readFileSync(sources, "utf8")) as {
      generation: number;
      fingerprints: Record<string, string>;
    };
    generation = saved.generation;
    for (const [path, fingerprint] of Object.entries(saved.fingerprints)) {
      options.fingerprints.set(path, fingerprint);
    }
  }
  const records: HookInvocation[] = [];
  if (existsSync(folder)) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isDirectory() && /^[a-f0-9-]+$/.test(entry.name)) {
        const path = join(folder, entry.name, "result.json");
        if (existsSync(path)) {
          const record = JSON.parse(readFileSync(path, "utf8")) as HookInvocation;
          if (record.status === "running") {
            record.status = "cancelled";
            record.error = "The server stopped before the invocation completed.";
          }
          records.push(record);
          generation = Math.max(generation, record.generation + 1);
        }
      }
    }
    records.sort((left, right) => left.input.startedAt.localeCompare(right.input.startedAt));
  }

  function save(record: HookInvocation): void {
    try {
      const destination = join(folder, record.id);
      mkdirSync(destination, { recursive: true });
      writeFileSync(join(destination, "input.json"), `${JSON.stringify(record.input, null, 2)}\n`);
      writeFileSync(join(destination, "stderr.txt"), record.stderr);
      writeFileSync(join(destination, "result.json"), `${JSON.stringify(record, null, 2)}\n`);
    } catch {
      stopped = options.texts.fill(hookFailureText, {
        hook: record.hookId,
        category: "invocation persistence failure",
      });
      throw new Error(stopped);
    }
    options.onChange();
  }

  function failure(hook: ScriptHook, category: string): string {
    return options.texts.fill(hookFailureText, { hook: hook.id, category });
  }

  function saveSources(): void {
    if (options.fingerprints !== undefined) {
      mkdirSync(folder, { recursive: true });
      writeFileSync(
        sources,
        `${JSON.stringify({ generation, fingerprints: Object.fromEntries(options.fingerprints) }, null, 2)}\n`,
      );
    }
  }

  function guard(): void {
    if (stopped !== undefined) {
      throw new Error(stopped);
    }
  }

  return {
    guard,
    saveSources,
    reset() {
      if (running.size > 0) {
        throw new Error("A hook is still running.");
      }
      stopped = undefined;
    },
    reload() {
      if (running.size > 0) {
        throw new Error("Stop the running hooks before reloading scripts.");
      }
      generation += 1;
      const previous = new Map(options.fingerprints);
      options.fingerprints?.clear();
      try {
        saveSources();
      } catch (error) {
        generation -= 1;
        for (const [path, fingerprint] of previous) {
          options.fingerprints?.set(path, fingerprint);
        }
        throw error;
      }
      options.onChange();
    },
    stop(id) {
      let hasStopped = false;
      for (const [invocationId, controller] of running) {
        if (id === undefined || id === invocationId) {
          controller.abort();
          hasStopped = true;
        }
      }
      return hasStopped;
    },
    summary: () => ({
      ...structuredClone(configuration),
      generation,
      revision: options.revision,
      source: options.source,
      invocations: structuredClone(records.slice(-100)),
    }),
    async dispatch(event, original, signal) {
      guard();
      const eventId = randomUUID();
      let data = structuredClone(original);
      let blocked: string | undefined;
      const matching = configuration.hooks.filter(
        (hook) =>
          hook.event === event &&
          !configuration.disabledHooks.includes(hook.id) &&
          (hook.match === undefined || hook.match.toolNames.includes(String(data.toolName))),
      );
      const order = configuration.hookOrder[event];
      if (order !== undefined) {
        matching.sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
      }
      for (const hook of matching) {
        const started = Date.now();
        const timeoutMs = hook.timeoutMs === undefined ? 10000 : hook.timeoutMs;
        const input: HookInput = {
          apiVersion: 1,
          invocationId: randomUUID(),
          eventId,
          event,
          hookId: hook.id,
          chatId: options.chatId,
          leafId: options.leaf(),
          projectFolder: options.projectFolder,
          startedAt: new Date(started).toISOString(),
          deadlineAt: timeoutMs === null ? null : new Date(started + timeoutMs).toISOString(),
          model: options.model(),
          settings: {},
          data: structuredClone(data),
        };
        const record: HookInvocation = {
          id: input.invocationId,
          hookId: hook.id,
          event,
          eventId,
          generation,
          revision: options.revision,
          status: blocked === undefined && stopped === undefined ? "running" : "skipped",
          input,
          output: null,
          accepted: null,
          stdout: "",
          stderr: "",
          exitCode: null,
          durationMs: 0,
          error: null,
        };
        records.push(record);
        save(record);
        if (record.status === "skipped") {
          continue;
        }
        const controller = new AbortController();
        running.set(record.id, controller);
        const invocationSignal = AbortSignal.any([
          controller.signal,
          ...(signal === undefined ? [] : [signal]),
        ]);
        try {
          invocationSignal.throwIfAborted();
          if (
            Buffer.byteLength(JSON.stringify(input)) > (hook.inputLimitBytes ?? 64 * 1024 * 1024)
          ) {
            throw new Error("The hook input exceeds its byte limit.");
          }
          const result = await options.execute(hook, input, invocationSignal);
          record.stdout = result.output;
          record.stderr = result.error;
          record.exitCode = result.exitCode;
          invocationSignal.throwIfAborted();
          if (result.failure !== undefined) {
            throw new Error(result.failure);
          }
          if (result.exitCode !== 0) {
            throw new Error(`The script exited with code ${result.exitCode}.`);
          }
          const output = readHookOutput(JSON.parse(result.output) as unknown, hook);
          record.output = output;
          let accepted = data;
          if (output.action === "replace") {
            const replacement = output.replacement as Record<string, unknown>;
            if (event === "tool_call") {
              options.validateInput(String(data.toolName), replacement.input);
            }
            accepted =
              event === "before_provider_request"
                ? { ...data, payload: replacement }
                : { ...data, ...replacement };
            if (event === "tool_result") {
              accepted.usage = data.usage;
            }
          }
          if (output.action === "block" && output.reason !== undefined) {
            const declared = hook.texts?.[output.reason.id];
            if (declared === undefined) {
              throw new Error("The hook's block text is unavailable.");
            }
            blocked = options.texts.fill(
              {
                ...declared,
                id: `hook.${hook.id}.${output.reason.id}`,
                group: `Hook ${hook.id}`,
                section: "result",
              },
              output.reason.values,
            );
            if (event !== "tool_call") {
              stopped = blocked;
            }
          }
          record.accepted = structuredClone(accepted);
          record.status = "succeeded";
          record.durationMs = Date.now() - started;
          save(record);
          data = accepted;
        } catch (error) {
          record.accepted = null;
          record.status = invocationSignal.aborted ? "cancelled" : "failed";
          record.error = error instanceof Error ? error.message : "The hook failed.";
          const policy = hook.onError ?? (hook.mode === "observe" ? "continue" : "stop");
          if (invocationSignal.aborted || policy === "stop") {
            stopped = failure(
              hook,
              invocationSignal.aborted ? "cancelled" : "execution or validation failure",
            );
          }
          record.durationMs = Date.now() - started;
          save(record);
        } finally {
          running.delete(record.id);
        }
      }
      guard();
      return { data, ...(blocked === undefined ? {} : { blocked }) };
    },
  };
}
