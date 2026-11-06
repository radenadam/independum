import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateToolArguments } from "@earendil-works/pi-ai";
import {
  type ExtensionToolContext,
  type ToolDefinition,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import type { Settings } from "./api-types.ts";
import { commandEnvironment } from "./command-environment.ts";
import type { Approvals, PermissionApprovalSave } from "./create-approvals.ts";
import {
  captureSandbox,
  type SandboxLaunch,
  sandboxCommand,
  sandboxRequest,
  sandboxRuntime,
} from "./create-sandbox.ts";
import type { ModelTexts } from "./model-texts.ts";
import {
  canonicalPermissionPath,
  containsPermissionPath,
  deniedPermissionPaths,
  evaluatePermission,
  hasSavedPermissionApproval,
  type PathAccess,
  type PermissionPolicy,
  type PermissionResource,
  type PermissionRule,
  permissionApprovalState,
  permissionPathIdentity,
  permissionResourceIdentity,
  validatePermissionResource,
} from "./permission-policy.ts";
import { permissionTexts } from "./permission-texts.ts";
import type { FileOperation } from "./run-file-operation.ts";
import { editTextList } from "./tools/create-edit-tool.ts";
import { readTextList } from "./tools/create-read-tool.ts";
import { writeTextList } from "./tools/create-write-tool.ts";
import { type Shell, sandboxShellReason } from "./tools/find-shell.ts";
import { fileTextList } from "./tools/text-file.ts";
import { fingerprintTextList } from "./tools/version-of.ts";

const workerTextIds = new Set(
  [...readTextList, ...writeTextList, ...editTextList, ...fileTextList, ...fingerprintTextList].map(
    (text) => text.id,
  ),
);

/** Dependencies captured by the tools of one applied profile. */
export interface PermissionToolsOptions {
  policy?: (chatId: string, folder: string) => PermissionPolicy;
  saveApproval?: (approval: PermissionApprovalSave) => Promise<PermissionPolicy>;
  settings: Settings;
  texts: ModelTexts;
  directory: string;
  shell: Shell | undefined;
  approvals: Approvals;
  launches: Map<string, SandboxLaunch>;
  profileName: string;
  revision: string;
  currentRevision: (chatId: string, folder: string) => string;
  isInteractive: (chatId: string) => boolean;
  audit: (chatId: string, data: unknown) => void;
}

/** Adds the final permission gate after Pi validates and transforms tool arguments. */
export function permissionTool(
  tool: ToolDefinition,
  options: PermissionToolsOptions,
): ToolDefinition {
  return {
    ...tool,
    async execute(id, parameters, signal, onUpdate, context) {
      const input = structuredClone(
        validateToolArguments(tool, {
          type: "toolCall",
          id,
          name: tool.name,
          arguments: parameters as Record<string, never>,
        }),
      ) as Record<string, unknown>;
      const settings = options.settings;
      const chatId = context.sessionManager.getSessionId();
      const policy = options.policy?.(chatId, context.cwd) ?? settings.permissions;
      if (options.currentRevision(chatId, context.cwd) !== options.revision) {
        throw new Error(
          options.texts.fill(permissionTexts.invalidated, {
            reason: "The applied profile changed.",
          }),
        );
      }
      if (settings.disabledTools.includes(tool.name)) {
        throw new Error(
          options.texts.fill(permissionTexts.rule, { reason: `${tool.name} is disabled.` }),
        );
      }
      if (
        policy.mode === "unrestricted" ||
        !["Shell", "Read", "Write", "Edit"].includes(tool.name)
      ) {
        return tool.execute(id, input, signal, onUpdate, context);
      }
      async function execute(): Promise<Awaited<ReturnType<ToolDefinition["execute"]>>> {
        signal?.throwIfAborted();
        if (tool.name === "Shell" && options.shell !== undefined) {
          const reason = sandboxShellReason(options.shell);
          if (reason !== null) {
            throw new Error(options.texts.fill(permissionTexts.unavailable, { reason }));
          }
        }
        const project = resolve(context.cwd);
        const location = canonicalPermissionPath(project, project);
        if (containsPermissionPath(options.directory, project)) {
          throw new Error(
            options.texts.fill(permissionTexts.rule, {
              reason: "The project folder is inside Independum's denied state folder.",
            }),
          );
        }
        if (tool.name === "Shell") {
          mkdirSync(join(project, ".independum"), { recursive: true });
        }
        const protectedPaths = [join(project, ".independum")];
        let resources: PermissionResource[];
        try {
          resources = requestedResources(tool.name, input, project);
        } catch (error) {
          throw new Error(
            options.texts.fill(permissionTexts.resource, {
              reason: error instanceof Error ? error.message : String(error),
            }),
          );
        }
        const environment =
          tool.name === "Shell"
            ? commandEnvironment(policy.environment, settings.environment)
            : commandEnvironment("minimal", {});
        function currentRuntime(): ReturnType<typeof sandboxRuntime> {
          return sandboxRuntime(
            tool.name === "Shell" ? (options.shell?.path ?? process.execPath) : process.execPath,
            tool.name === "Shell" ? policy.environment : "minimal",
            Object.keys(environment),
          );
        }
        const runtime = currentRuntime();
        const reasons: string[] = [];
        const required: PermissionResource[] = [];
        const matchingRules = new Map<string, PermissionRule>();
        for (const resource of resources) {
          const result = evaluatePermission(policy, project, resource, protectedPaths, [
            options.directory,
          ]);
          for (const rule of result.matches) {
            matchingRules.set(rule.id, rule);
          }
          if (result.decision === "deny") {
            throw new Error(
              options.texts.fill(permissionTexts.rule, {
                reason: result.reason,
              }),
            );
          }
          if (
            result.decision === "ask" &&
            !hasSavedPermissionApproval(policy, project, resource) &&
            !options.approvals.allows(chatId, options.revision, resource)
          ) {
            required.push(resource);
            reasons.push(result.reason);
          }
        }
        const paths = resources.filter(
          (resource): resource is PathAccess => resource.kind === "path",
        );
        const baseline: PathAccess[] =
          tool.name === "Shell"
            ? [{ kind: "path", path: project, scope: "tree", access: "write" }]
            : [];
        const readonlyPaths =
          tool.name === "Shell"
            ? [
                ...new Set(
                  protectedPaths.flatMap((protectedPath) =>
                    [...baseline, ...paths]
                      .filter(
                        (grant) =>
                          grant.access === "write" &&
                          (containsPermissionPath(grant.path, protectedPath) ||
                            containsPermissionPath(protectedPath, grant.path)),
                      )
                      .map((grant) =>
                        containsPermissionPath(grant.path, protectedPath)
                          ? protectedPath
                          : grant.path,
                      )
                      .filter(
                        (intersection) =>
                          !paths.some(
                            (grant) =>
                              grant.access === "write" &&
                              containsPermissionPath(grant.path, intersection),
                          ),
                      ),
                  ),
                ),
              ]
            : [];
        const launch: SandboxLaunch = {
          runtime,
          paths: [...baseline, ...paths].map((resource) => ({
            ...resource,
            path: canonicalPermissionPath(resource.path, project),
          })),
          readonlyPaths: readonlyPaths.map((path) => canonicalPermissionPath(path, project)),
          deniedPaths: deniedPermissionPaths(policy, project, options.directory),
          network: resources.some((resource) => resource.kind === "network"),
        };
        applyRuleExclusions(launch, options, policy, project, paths);
        const folder =
          tool.name === "Shell"
            ? resolve(project, typeof input.workdir === "string" ? input.workdir : ".")
            : project;
        try {
          sandboxRequest(
            launch,
            sandboxCommand(process.execPath, ["--version"]),
            folder,
            environment,
          );
        } catch (error) {
          throw new Error(
            options.texts.fill(permissionTexts.unavailable, {
              reason: error instanceof Error ? error.message : "Sandbox setup failed.",
            }),
          );
        }
        function currentIdentities(): string[] {
          return [
            permissionResourceIdentity({
              kind: "path",
              path: project,
              scope: "tree",
              access: "read",
            }),
            ...resources.map(permissionResourceIdentity),
          ];
        }
        const identities = currentIdentities();
        let approvalState = permissionApprovalState(policy);
        let chatApprovalState = JSON.stringify(options.approvals.saved(chatId));
        const branch = permissionBranch(context.sessionManager);
        const revision = createHash("sha256")
          .update(
            JSON.stringify({
              id,
              input,
              project,
              identities,
              branch,
              revision: options.revision,
              runtime: runtime.runtimeHash,
            }),
          )
          .digest("hex");
        function isCurrent(): boolean {
          try {
            return (
              signal?.aborted !== true &&
              options.currentRevision(chatId, context.cwd) === options.revision &&
              permissionApprovalState(
                options.policy?.(chatId, context.cwd) ?? settings.permissions,
              ) === approvalState &&
              JSON.stringify(options.approvals.saved(chatId)) === chatApprovalState &&
              canonicalPermissionPath(context.cwd, context.cwd) === location &&
              JSON.stringify(resources) ===
                JSON.stringify(requestedResources(tool.name, input, project)) &&
              JSON.stringify(identities) === JSON.stringify(currentIdentities()) &&
              permissionBranch(context.sessionManager) === branch &&
              runtime.runtimeHash === currentRuntime().runtimeHash
            );
          } catch {
            return false;
          }
        }
        let isAllowed = true;
        if (required.length > 0) {
          if (!options.isInteractive(chatId)) {
            return {
              content: [{ type: "text", text: options.texts.get(permissionTexts.required) }],
              details: { outcome: "approvalRequired", resources, runtime },
              isError: true,
            };
          }
          isAllowed = await options.approvals.request(
            {
              revision,
              chatId,
              toolCallId: id,
              toolName: tool.name,
              profileName: options.profileName,
              input,
              project,
              resources: [...baseline, ...resources],
              requiredResources: required,
              persistences:
                options.saveApproval === undefined ? ["once"] : ["once", "chat", "project"],
              restrictions: launch.deniedPaths,
              readonlyPaths,
              matchingRules: [...matchingRules.values()],
              reasons,
              runtime,
            },
            signal,
            (approval) => {
              options.audit(chatId, { state: "waiting", approval });
              onUpdate?.({ content: [], details: { approval } });
            },
            isCurrent,
            async (persistence) => {
              if (persistence === "once") {
                return;
              }
              const saved = await options.saveApproval?.({
                chatId,
                folder: context.cwd,
                binding: options.revision,
                project,
                resources: persistence === "project" ? required : [],
                isCurrent,
              });
              if (saved !== undefined) {
                approvalState = permissionApprovalState(saved);
              }
              if (!isCurrent() || signal?.aborted === true) {
                throw new Error("The approval changed before access could be saved.");
              }
              if (persistence === "chat") {
                options.approvals.remember(chatId, options.revision, project, required);
                chatApprovalState = JSON.stringify(options.approvals.saved(chatId));
              }
            },
          );
          options.audit(chatId, {
            state:
              signal?.aborted === true
                ? "cancelled"
                : !isCurrent()
                  ? "invalidated"
                  : isAllowed
                    ? "allowed"
                    : "denied",
            toolCallId: id,
            revision,
          });
        }
        signal?.throwIfAborted();
        if (!isCurrent()) {
          throw new Error(
            options.texts.fill(permissionTexts.invalidated, {
              reason: "The policy, resource identity, runtime, or chat branch changed.",
            }),
          );
        }
        // A denial is the user's choice, so its result says so instead of reading as a failure.
        if (!isAllowed) {
          return {
            content: [{ type: "text", text: options.texts.get(permissionTexts.denied) }],
            details: { outcome: "denied" },
            isError: true,
          };
        }
        const startedAt = Date.now();
        onUpdate?.({ content: [], details: { permissionExecutionStartedAt: startedAt } });
        options.launches.set(id, launch);
        try {
          const result =
            tool.name === "Shell"
              ? await tool.execute(id, input, signal, onUpdate, context)
              : await fileWorker(
                  {
                    name: tool.name,
                    id,
                    input,
                    folder: project,
                    settings: {
                      texts: Object.fromEntries(
                        Object.entries(settings.texts).filter(([id]) => workerTextIds.has(id)),
                      ),
                      outputLimits: settings.outputLimits,
                    },
                    branch: fingerprintBranch(context),
                    model:
                      context.model === undefined
                        ? undefined
                        : {
                            input: context.model.input,
                            ...(context.model.inputLimits === undefined
                              ? {}
                              : { inputLimits: context.model.inputLimits }),
                          },
                  },
                  launch,
                  environment,
                  signal,
                );
          return {
            ...result,
            details: {
              ...(typeof result.details === "object" && result.details !== null
                ? result.details
                : {}),
              permission: {
                revision,
                runtimeHash: runtime.runtimeHash,
                backend: runtime.backend,
                resources,
                startedAt,
                durationMs: Date.now() - startedAt,
              },
            },
          };
        } finally {
          options.launches.delete(id);
        }
      }
      return tool.name === "Shell"
        ? execute()
        : withFileMutationQueue(canonicalPermissionPath(String(input.path), context.cwd), execute);
    },
  };
}

function requestedResources(
  name: string,
  input: Record<string, unknown>,
  project: string,
): PermissionResource[] {
  const resources: PermissionResource[] = [];
  if (name !== "Shell") {
    const target = canonicalPermissionPath(String(input.path), project);
    let path = resolve(project, String(input.path));
    for (;;) {
      const location = canonicalPermissionPath(path, project);
      const identity = permissionPathIdentity(location);
      if (identity !== undefined) {
        if (location === target && identity.isDirectory()) {
          throw new Error("The file tools require a file path, not a folder.");
        }
        if (location === target && (identity.isSymbolicLink() || identity.nlink > 1)) {
          throw new Error("The file identity is linked and cannot be isolated safely.");
        }
        break;
      }
      path = dirname(path);
    }
    resources.push({
      kind: "path",
      path,
      scope: canonicalPermissionPath(path, project) === target ? "file" : "tree",
      access: name === "Read" ? "read" : "write",
    });
  } else {
    if (input.workdir !== undefined) {
      resources.push({
        kind: "path",
        path: resolve(project, String(input.workdir)),
        scope: "tree",
        access: "read",
      });
    }
    if (input.access !== undefined) {
      const access = input.access as { paths?: Omit<PathAccess, "kind">[]; network?: boolean };
      for (const entry of access.paths ?? []) {
        validatePermissionResource({ kind: "path", ...entry });
        const path = resolve(project, entry.path);
        const identity = permissionPathIdentity(canonicalPermissionPath(path, project));
        if (
          identity === undefined ||
          (entry.scope === "file" ? !identity.isFile() : !identity.isDirectory())
        ) {
          throw new Error(shellGrantFailure(entry.scope));
        }
        resources.push({
          kind: "path",
          ...entry,
          path,
        });
      }
      if (access.network === true) {
        resources.push({ kind: "network" });
      }
    }
  }
  if (
    (project.startsWith("\\\\") ||
      resources.some((resource) => resource.kind === "path" && resource.path.startsWith("\\\\"))) &&
    !resources.some((resource) => resource.kind === "network")
  ) {
    resources.push({ kind: "network" });
  }
  return resources;
}

function shellGrantFailure(scope: "file" | "tree"): string {
  return scope === "file"
    ? "A Shell file grant requires an existing regular file. New files require an explicit grant for an existing parent folder with tree scope."
    : "A Shell tree grant requires an existing folder.";
}

function fingerprintBranch(context: ExtensionToolContext): FileOperation["branch"] {
  return context.sessionManager
    .getBranch()
    .filter((entry) => entry.type === "message" && entry.message.role === "toolResult")
    .map((entry) => {
      if (entry.type !== "message" || entry.message.role !== "toolResult") {
        return entry;
      }
      const details = entry.message.details;
      return {
        ...entry,
        message: {
          ...entry.message,
          content: [],
          details:
            typeof details === "object" && details !== null && "fingerprint" in details
              ? { fingerprint: details.fingerprint }
              : null,
        },
      };
    });
}

/** Returns the branch position that permission decisions bind to without audit entries. */
export function permissionBranch(
  sessionManager: ExtensionToolContext["sessionManager"],
  isContext = false,
): string | undefined {
  return sessionManager
    .getBranch()
    .findLast(
      (entry) =>
        entry.type === "compaction" ||
        (entry.type === "message" &&
          entry.message.role !== "toolResult" &&
          (!isContext || entry.message.role === "user")),
    )?.id;
}

async function fileWorker(
  operation: FileOperation,
  launch: SandboxLaunch,
  environment: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<Awaited<ReturnType<ToolDefinition["execute"]>>> {
  const worker = fileURLToPath(new URL("./run-file-operation.ts", import.meta.url));
  const end = await captureSandbox(
    sandboxRequest(
      launch,
      sandboxCommand(globalThis.process.execPath, [worker]),
      dirname(worker),
      environment,
    ),
    JSON.stringify(operation),
    signal,
  );
  let response: { result?: Awaited<ReturnType<ToolDefinition["execute"]>>; error?: string };
  try {
    response = JSON.parse(end.output) as typeof response;
  } catch {
    throw new Error(`The restricted file worker exits with code ${end.exitCode}. ${end.error}`);
  }
  if (response.result === undefined || end.exitCode !== 0) {
    throw new Error(
      response.error ?? `The restricted file worker exits with code ${end.exitCode}.`,
    );
  }
  return response.result;
}

function applyRuleExclusions(
  launch: SandboxLaunch,
  options: PermissionToolsOptions,
  policy: PermissionPolicy,
  project: string,
  explicit: PathAccess[],
): void {
  for (const rule of policy.rules) {
    if (
      rule.effect === "allow" ||
      rule.resource.kind !== "path" ||
      (rule.project !== "*" &&
        canonicalPermissionPath(rule.project, project) !==
          canonicalPermissionPath(project, project))
    ) {
      continue;
    }
    const path = canonicalPermissionPath(rule.resource.path, project);
    if (
      rule.effect === "ask" &&
      explicit.some(
        (grant) =>
          containsPermissionPath(grant.path, path) &&
          (grant.access === "write" ||
            (rule.resource.kind === "path" && rule.resource.access === "read")),
      )
    ) {
      continue;
    }
    if (rule.resource.access === "write") {
      if (
        launch.paths.some(
          (grant) =>
            grant.access === "write" &&
            (containsPermissionPath(grant.path, path) || containsPermissionPath(path, grant.path)),
        )
      ) {
        throw new Error(
          options.texts.fill(permissionTexts.unavailable, {
            reason: `The adapter does not compile the write-only exclusion of permission rule ${rule.id} inside a writable grant.`,
          }),
        );
      }
    } else if (rule.effect === "ask") {
      launch.deniedPaths.push(path);
    }
  }
}
