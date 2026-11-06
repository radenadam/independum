import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import type { ExtensionContext, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { commandEnvironment } from "./command-environment.ts";
import { captureSandbox, sandboxCommand, sandboxRequest } from "./create-sandbox.ts";
import type { ScriptResult } from "./create-script-hooks.ts";
import type { HookInput, ScriptHook } from "./hook-contract.ts";
import { type PermissionToolsOptions, permissionTool } from "./permission-tool.ts";

/** Runs a script through the same approval and sandbox gate as project commands. */
export async function executeScriptHook(
  hook: ScriptHook,
  input: HookInput,
  signal: AbortSignal,
  context: ExtensionContext,
  source: string,
  snapshots: Map<string, string>,
  options: PermissionToolsOptions,
  saveSources?: () => void,
): Promise<ScriptResult> {
  const folder = hook.run.workingDirectory === "source" ? source : context.cwd;
  const executable = resolveExecutable(hook.run.command[0] ?? "", folder);
  const arguments_ = hook.run.command.slice(1);
  const files = [executable, ...arguments_.map((argument) => resolve(folder, argument))].filter(
    (file) => existsSync(file) && statSync(file).isFile(),
  );
  let captured: ScriptResult | undefined;
  const tool = permissionTool(
    {
      name: `Hook ${hook.id}`,
      label: `Hook ${hook.id}`,
      description: "",
      parameters: Type.Object({}, { additionalProperties: true }),
      async execute(id) {
        const launch = options.launches.get(id);
        if (launch === undefined) {
          throw new Error("The hook has no authorized sandbox launch.");
        }
        const candidate = new Map<string, string>();
        for (const file of files) {
          const path = realpathSync.native(file);
          const fingerprint = createHash("sha256").update(readFileSync(path)).digest("hex");
          if (snapshots.has(path) && snapshots.get(path) !== fingerprint) {
            throw new Error("Hook code changed on disk. Reload scripts before running it.");
          }
          candidate.set(path, fingerprint);
        }
        for (const [path, fingerprint] of candidate) {
          snapshots.set(path, fingerprint);
        }
        saveSources?.();
        input.deadlineAt =
          hook.timeoutMs === null
            ? null
            : new Date(Date.now() + (hook.timeoutMs ?? 10000)).toISOString();
        captured = await captureSandbox(
          sandboxRequest(
            launch,
            sandboxCommand(executable, arguments_),
            folder,
            commandEnvironment(
              options.settings.permissions.environment,
              options.settings.environment,
            ),
          ),
          JSON.stringify(input),
          signal,
          {
            outputLimitBytes: hook.outputLimitBytes ?? 16 * 1024 * 1024,
            errorLimitBytes: hook.errorLimitBytes ?? 1024 * 1024,
            timeoutMs: hook.timeoutMs === undefined ? 10000 : hook.timeoutMs,
          },
        );
        return { content: [], details: {} };
      },
    },
    { ...options, scriptExecutable: executable },
  );
  const result = await tool.execute(
    input.invocationId,
    {
      command: sandboxCommand(executable, arguments_),
      workdir: folder,
      access: {
        paths: files
          .filter((path) => path !== executable)
          .map((path) => ({ path, scope: "file", access: "read" })),
      },
    },
    signal,
    (update) =>
      options.audit(input.chatId, {
        hookId: hook.id,
        invocationId: input.invocationId,
        progress: update.details,
      }),
    context as ExtensionToolContext,
  );
  if (captured === undefined) {
    const outcome =
      typeof result.details === "object" && result.details !== null && "outcome" in result.details
        ? result.details.outcome
        : "unavailable";
    throw new Error(`Hook execution requires permission. Outcome: ${String(outcome)}.`);
  }
  return captured;
}

function resolveExecutable(name: string, folder: string): string {
  const candidates =
    isAbsolute(name) || name.includes("/") || name.includes("\\")
      ? [resolve(folder, name)]
      : (
          process.env[
            Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH"
          ] ?? ""
        )
          .split(delimiter)
          .filter((path) => path !== "")
          .flatMap((path) =>
            process.platform === "win32" && !name.endsWith(".exe")
              ? [join(path, `${name}.exe`)]
              : [join(path, name)],
          );
  const executable = candidates.find((path) => existsSync(path) && statSync(path).isFile());
  if (executable === undefined) {
    throw new Error("The hook executable is not an existing program on the command path.");
  }
  return realpathSync.native(executable);
}
