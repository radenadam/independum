import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ExtensionContext, SessionManager } from "@earendil-works/pi-coding-agent";
import { commandEnvironment } from "./command-environment.ts";
import { createApprovals } from "./create-approvals.ts";
import { type SandboxRuntime, sandboxRuntime } from "./create-sandbox.ts";
import type { HookInput, ScriptHook } from "./hook-contract.ts";
import { createModelTexts } from "./model-texts.ts";
import type { PermissionToolsOptions } from "./permission-tool.ts";
import { builtInSettings } from "./read-settings-change.ts";
import { createTestProject } from "./tools/create-test-folder.ts";

/** Creates an isolated script invocation with the real permission gate. */
export function createHookTest(parent: string): {
  hook: ScriptHook;
  input: HookInput;
  context: ExtensionContext;
  project: string;
  script: string;
  runtime: SandboxRuntime;
  options: PermissionToolsOptions;
  snapshots: Map<string, string>;
} {
  const { directory, project } = createTestProject(parent);
  const state = join(directory, "state");
  const configuration = join(project, ".independum");
  mkdirSync(state);
  mkdirSync(configuration);
  const script = join(configuration, "hook.ts");
  writeFileSync(script, "process.stdout.write('result');");
  const context = {
    cwd: project,
    sessionManager: SessionManager.inMemory(project),
  } as unknown as ExtensionContext;
  const hook: ScriptHook = {
    id: "guard",
    event: "tool_call",
    mode: "transform",
    run: { command: [process.execPath, script], workingDirectory: "project" },
  };
  const input: HookInput = {
    apiVersion: 1,
    invocationId: "invocation",
    eventId: "event",
    event: hook.event,
    hookId: hook.id,
    chatId: context.sessionManager.getSessionId(),
    leafId: null,
    projectFolder: project,
    startedAt: new Date().toISOString(),
    deadlineAt: null,
    model: null,
    settings: {},
    data: { toolName: "Read", input: { path: "file" } },
  };
  const settings = structuredClone(builtInSettings);
  const environment = commandEnvironment("minimal", {});
  const runtime = sandboxRuntime(process.execPath, "minimal", Object.keys(environment));
  const options: PermissionToolsOptions = {
    settings,
    texts: createModelTexts(() => ({})),
    directory: state,
    shell: undefined,
    approvals: createApprovals(),
    launches: new Map(),
    profileName: "Default",
    revision: "revision",
    currentRevision: () => "revision",
    isInteractive: () => false,
    audit: () => undefined,
  };
  return { hook, input, context, project, script, runtime, options, snapshots: new Map() };
}
