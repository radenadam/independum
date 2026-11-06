import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import {
  type ExtensionToolContext,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { createApprovals, type PermissionApprovalSave } from "./create-approvals.ts";
import { type SandboxLaunch, sandboxRequest, sandboxRuntime } from "./create-sandbox.ts";
import { createModelTexts } from "./model-texts.ts";
import {
  canonicalPermissionPath,
  type PermissionPolicy,
  permissionResourceIdentity,
} from "./permission-policy.ts";
import { permissionTool } from "./permission-tool.ts";
import { builtInSettings } from "./read-settings-change.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";

vi.mock("./create-sandbox.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./create-sandbox.ts")>();
  return {
    ...actual,
    sandboxRuntime: vi.fn(() => ({
      backend: "processcontainer",
      support: { isSupported: true, availableMethods: ["processcontainer"] },
      readonlyPaths: [],
      implicitAccess: "Test baseline.",
      environment: "minimal",
      environmentNames: [],
      runtimeHash: `sha256:${"b".repeat(64)}`,
      unavailable: null,
    })),
    sandboxRequest: vi.fn(() => ({ command: "validated" })),
  };
});

const parent = createTestFolder("permission-gate");

function fixture(isInteractive = true): {
  tool: ToolDefinition;
  options: Parameters<typeof permissionTool>[1];
  context: ExtensionToolContext;
  effect: ReturnType<typeof vi.fn>;
  changeRevision: () => void;
} {
  const { directory, project } = createTestProject(parent, true);
  const state = join(directory, ".independum");
  mkdirSync(state);
  const manager = SessionManager.inMemory(project);
  const settings = structuredClone(builtInSettings);
  let revision = "profile-revision";
  const effect = vi.fn(async () => ({
    content: [{ type: "text" as const, text: "executed" }],
    details: {},
  }));
  const options: Parameters<typeof permissionTool>[1] = {
    settings,
    texts: createModelTexts(() => settings.texts),
    directory: state,
    shell: {
      kind: process.platform === "win32" ? "powershell" : "bash",
      path: process.execPath,
      name: "Test shell",
    },
    approvals: createApprovals(),
    launches: new Map<string, SandboxLaunch>(),
    profileName: "Default",
    revision,
    currentRevision: () => revision,
    isInteractive: () => isInteractive,
    audit: vi.fn(),
  };
  const tool = permissionTool(
    {
      name: "Shell",
      label: "Shell",
      description: "Test tool.",
      parameters: Type.Object({
        command: Type.String(),
        access: Type.Optional(
          Type.Object({
            network: Type.Optional(Type.Boolean()),
            paths: Type.Optional(
              Type.Array(
                Type.Object({
                  path: Type.String(),
                  scope: Type.Union([Type.Literal("file"), Type.Literal("tree")]),
                  access: Type.Union([Type.Literal("read"), Type.Literal("write")]),
                }),
              ),
            ),
          }),
        ),
      }),
      execute: effect,
    },
    options,
  );
  return {
    tool,
    options,
    context: { cwd: project, sessionManager: manager } as unknown as ExtensionToolContext,
    effect,
    changeRevision: () => {
      revision = "changed";
    },
  };
}

function persistApprovals(options: Parameters<typeof permissionTool>[1]): void {
  async function saveApproval({
    project,
    resources,
    runtime,
  }: PermissionApprovalSave): Promise<PermissionPolicy> {
    if (runtime !== undefined) {
      options.settings.permissions.runtimeApprovals = [
        {
          backend: runtime.backend,
          runtimeHash: runtime.runtimeHash,
          approvedAt: new Date().toISOString(),
        },
      ];
    }
    for (const resource of resources) {
      options.settings.permissions.savedApprovals.push({
        id: String(options.settings.permissions.savedApprovals.length),
        project,
        resource,
        identity: permissionResourceIdentity(resource),
        approvedAt: new Date().toISOString(),
      });
    }
    return options.settings.permissions;
  }
  options.saveApproval = saveApproval;
}

test("headless calls return approval required immediately without effects or pending prompts", async () => {
  const { tool, context, options, effect } = fixture(false);
  const result = await tool.execute(
    "call",
    { command: "unchanged", access: { network: true } },
    undefined,
    undefined,
    context,
  );
  expect(result.details).toMatchObject({ outcome: "approvalRequired" });
  expect(effect).not.toHaveBeenCalled();
  expect(options.approvals.pending()).toEqual([]);
});

test("approval binds a copy of the exact input and makes the launch grant available only during execution", async () => {
  const { tool, context, options, effect } = fixture();
  const input = { command: "original", access: { network: true } };
  const execution = tool.execute("call", input, undefined, undefined, context);
  const pending = options.approvals.pending()[0];
  expect(pending?.input).toEqual(input);
  expect(pending?.project).toBe(context.cwd);
  expect(pending?.readonlyPaths).toEqual([join(context.cwd, ".independum")]);
  expect(pending?.resources[0]).toMatchObject({ path: context.cwd });
  input.command = "changed later";
  effect.mockImplementation(async () => {
    expect(options.launches.get("call")).toMatchObject({ network: true });
    expect(options.launches.get("call")?.readonlyPaths).toEqual([
      canonicalPermissionPath(join(context.cwd, ".independum"), context.cwd),
    ]);
    return { content: [], details: {} };
  });
  expect(await options.approvals.resolve(pending?.id ?? "", pending?.revision ?? "", "allow")).toBe(
    200,
  );
  const result = await execution;
  expect(effect.mock.calls[0]?.[1]).toEqual({ command: "original", access: { network: true } });
  expect(result.details).toHaveProperty("permission");
  expect(options.launches.size).toBe(0);
});

test("denial and policy changes never call the underlying tool", async () => {
  for (const hasChanged of [false, true]) {
    const { tool, context, options, effect, changeRevision } = fixture();
    const execution = tool.execute("call", { command: "never" }, undefined, undefined, context);
    const pending = options.approvals.pending()[0];
    if (hasChanged) {
      changeRevision();
    }
    const result = hasChanged
      ? expect(execution).rejects.toThrow("no longer valid")
      : expect(execution).resolves.toMatchObject({
          content: [{ type: "text", text: expect.stringContaining("user denied") }],
          details: { outcome: "denied" },
          isError: true,
        });
    expect(
      await options.approvals.resolve(
        pending?.id ?? "",
        pending?.revision ?? "",
        hasChanged ? "allow" : "deny",
      ),
    ).toBe(hasChanged ? 409 : 200);
    await result;
    expect(effect).not.toHaveBeenCalled();
  }
});

test.each(["chat", "project"] as const)(
  "saved %s path grants keep the supplied spelling and compare real locations",
  async (persistence) => {
    const { tool, context, options, effect } = fixture();
    persistApprovals(options);
    const path = join(options.directory, "outside.txt");
    writeFileSync(path, "sentinel");
    const resource = { kind: "path", path, scope: "file", access: "read" } as const;
    effect.mockImplementation(async () => {
      expect(options.launches.get("first")?.paths).toContainEqual({
        ...resource,
        path: canonicalPermissionPath(path, context.cwd),
      });
      return { content: [], details: {} };
    });
    const input = { command: "read", access: { paths: [resource] } };
    const execution = tool.execute("first", input, undefined, undefined, context);
    const pending = options.approvals.pending()[0];
    expect(pending?.project).toBe(context.cwd);
    expect(pending?.requiredResources).toEqual([resource]);
    expect(
      await options.approvals.resolve(
        pending?.id ?? "",
        pending?.revision ?? "",
        "allow",
        persistence,
      ),
    ).toBe(200);
    await execution;
    const grants =
      persistence === "project"
        ? options.settings.permissions.savedApprovals
        : options.approvals.saved(context.sessionManager.getSessionId());
    expect(grants[0]).toMatchObject({ project: context.cwd, resource });
    effect.mockImplementation(async () => ({ content: [], details: {} }));
    options.isInteractive = vi.fn(() => false);
    await tool.execute(
      "again",
      {
        ...input,
        access: { paths: [{ ...resource, path: canonicalPermissionPath(path, context.cwd) }] },
      },
      undefined,
      undefined,
      context,
    );
    expect(effect).toHaveBeenCalledTimes(2);
  },
);

test("disabled tools and unavailable enforcement refuse before effects", async () => {
  const { tool, context, options, effect } = fixture();
  options.settings.disabledTools.push("Shell");
  await expect(
    tool.execute("call", { command: "never" }, undefined, undefined, context),
  ).rejects.toThrow("disabled");
  options.settings.disabledTools = [];
  vi.mocked(sandboxRequest).mockImplementationOnce(() => {
    throw new Error("Setup denied.");
  });
  await expect(
    tool.execute("call", { command: "never" }, undefined, undefined, context),
  ).rejects.toThrow("Setup denied");
  expect(effect).not.toHaveBeenCalled();
});

test("new calls stop using an unrestricted profile when its revision changes", async () => {
  const { tool, context, options, effect, changeRevision } = fixture();
  options.settings.permissions.mode = "unrestricted";
  changeRevision();
  await expect(
    tool.execute("call", { command: "never" }, undefined, undefined, context),
  ).rejects.toThrow("applied profile changed");
  expect(effect).not.toHaveBeenCalled();
});

test("file tools authorize before image detection, content reads, and name discovery", async () => {
  const { context, options } = fixture();
  const outside = join(parent, "outside.txt");
  writeFileSync(outside, "not supplied to approval");
  const { createReadTool } = await import("./tools/create-read-tool.ts");
  const read = permissionTool(
    createReadTool({ texts: options.texts, getLimits: () => options.settings.outputLimits }),
    options,
  );
  const execution = read.execute("read", { path: outside }, undefined, undefined, context);
  await vi.waitFor(() => expect(options.approvals.pending()).toHaveLength(1));
  const pending = options.approvals.pending()[0];
  expect(JSON.stringify(pending)).not.toContain("not supplied to approval");
  const result = expect(execution).resolves.toMatchObject({ details: { outcome: "denied" } });
  await options.approvals.resolve(pending?.id ?? "", pending?.revision ?? "", "deny");
  await result;
});

test("startup approval is reused for the profile until the runtime changes or approval is removed", async () => {
  const { tool, context, options, effect } = fixture();
  persistApprovals(options);
  const first = tool.execute("first", { command: "first" }, undefined, undefined, context);
  const approval = options.approvals.pending()[0];
  expect(approval?.persistences).toEqual(["once", "runtime"]);
  expect(
    await options.approvals.resolve(
      approval?.id ?? "",
      approval?.revision ?? "",
      "allow",
      "runtime",
    ),
  ).toBe(200);
  await first;
  options.isInteractive = vi.fn(() => false);
  await tool.execute("second", { command: "second" }, undefined, undefined, context);
  expect(effect).toHaveBeenCalledTimes(2);
  const runtime = sandboxRuntime(process.execPath, "minimal", []);
  vi.mocked(sandboxRuntime).mockReturnValueOnce({
    ...runtime,
    runtimeHash: `sha256:${"c".repeat(64)}`,
  });
  expect(
    (await tool.execute("changed", { command: "changed" }, undefined, undefined, context)).details,
  ).toMatchObject({ outcome: "approvalRequired" });
  options.settings.permissions.runtimeApprovals = [];
  expect(
    (await tool.execute("removed", { command: "removed" }, undefined, undefined, context)).details,
  ).toMatchObject({ outcome: "approvalRequired" });
  expect(effect).toHaveBeenCalledTimes(2);
});

test.each(["chat", "project"] as const)(
  "saved %s network access remains explicit and deny rules still win",
  async (persistence) => {
    const { tool, context, options, effect } = fixture();
    persistApprovals(options);
    const first = tool.execute(
      "first",
      { command: "first", access: { network: true } },
      undefined,
      undefined,
      context,
    );
    const approval = options.approvals.pending()[0];
    expect(
      await options.approvals.resolve(
        approval?.id ?? "",
        approval?.revision ?? "",
        "allow",
        persistence,
      ),
    ).toBe(200);
    await first;
    options.isInteractive = vi.fn(() => false);
    effect.mockImplementation(async () => {
      expect(options.launches.get("without-network")?.network).toBe(false);
      return { content: [], details: {} };
    });
    await tool.execute("without-network", { command: "local" }, undefined, undefined, context);
    effect.mockImplementation(async () => ({ content: [], details: {} }));
    await tool.execute(
      "with-network",
      { command: "network", access: { network: true } },
      undefined,
      undefined,
      context,
    );
    expect(effect).toHaveBeenCalledTimes(3);
    options.settings.permissions.rules.push({
      id: "deny",
      effect: "deny",
      project: context.cwd,
      resource: { kind: "network" },
    });
    await expect(
      tool.execute(
        "denied",
        { command: "denied", access: { network: true } },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow("Permission rules deny");
    expect(effect).toHaveBeenCalledTimes(3);
  },
);

test.each(["runtime", "network"] as const)(
  "removing %s approval invalidates a waiting operation",
  async (kind) => {
    const { tool, context, options, effect } = fixture();
    const runtime = sandboxRuntime(process.execPath, "minimal", []);
    const resource = { kind: "network" } as const;
    persistApprovals(options);
    await options.saveApproval?.({
      chatId: context.sessionManager.getSessionId(),
      folder: context.cwd,
      binding: options.revision,
      project: context.cwd,
      resources: kind === "network" ? [resource] : [],
      ...(kind === "runtime" ? { runtime } : {}),
      isCurrent: () => true,
    });
    const execution = tool.execute(
      "waiting",
      { command: "waiting", access: { network: true } },
      undefined,
      undefined,
      context,
    );
    const failed = expect(execution).rejects.toThrow("no longer valid");
    const approval = options.approvals.pending()[0];
    options.settings.permissions.runtimeApprovals = [];
    options.settings.permissions.savedApprovals = [];
    expect(
      await options.approvals.resolve(approval?.id ?? "", approval?.revision ?? "", "allow"),
    ).toBe(409);
    await failed;
    expect(effect).not.toHaveBeenCalled();
  },
);
