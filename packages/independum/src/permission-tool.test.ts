import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import {
  type ExtensionToolContext,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { createApprovals, type PermissionApprovalSave } from "./create-approvals.ts";
import { captureSandbox, type SandboxLaunch, sandboxRequest } from "./create-sandbox.ts";
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
    captureSandbox: vi.fn(async () => ({
      output: JSON.stringify({
        result: { content: [{ type: "text", text: "worker result" }], details: {} },
      }),
      error: "",
      exitCode: 0,
      warnings: [],
    })),
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
  }: PermissionApprovalSave): Promise<PermissionPolicy> {
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
    const execution = tool.execute(
      "call",
      { command: "never", access: { network: true } },
      undefined,
      undefined,
      context,
    );
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
    const path = join(context.cwd, "..", "outside.txt");
    writeFileSync(path, "sentinel");
    const resource = { kind: "path", path, scope: "file", access: "write" } as const;
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

test("local commands and outside reads need no startup approval", async () => {
  const { tool, context, options, effect } = fixture(false);
  const outside = join(context.cwd, "..", "readable.txt");
  writeFileSync(outside, "readable");
  await tool.execute("local", { command: "local" }, undefined, undefined, context);
  await tool.execute(
    "read",
    { command: "read", access: { paths: [{ path: outside, scope: "file", access: "read" }] } },
    undefined,
    undefined,
    context,
  );
  expect(effect).toHaveBeenCalledTimes(2);
  expect(options.approvals.pending()).toEqual([]);
});

test("the state folder stays denied even under explicit allow rules and saved approvals", async () => {
  const { tool, context, options, effect } = fixture();
  const file = join(options.directory, "private.txt");
  writeFileSync(file, "private");
  for (const access of ["read", "write"] as const) {
    const resource = { kind: "path", path: file, scope: "file", access } as const;
    options.settings.permissions.rules = [{ id: "allow", project: "*", effect: "allow", resource }];
    options.approvals.remember(
      context.sessionManager.getSessionId(),
      options.revision,
      context.cwd,
      [resource],
    );
    await expect(
      tool.execute(
        "blocked",
        { command: "blocked", access: { paths: [resource] } },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow("state folder is denied");
  }
  expect(effect).not.toHaveBeenCalled();
  expect(options.approvals.pending()).toEqual([]);
});

test("a project inside the state folder refuses before creating project configuration", async () => {
  const { tool, options, context, effect } = fixture();
  await expect(
    tool.execute("private-project", { command: "blocked" }, undefined, undefined, {
      ...context,
      cwd: options.directory,
    }),
  ).rejects.toThrow("inside Independum's denied state folder");
  expect(existsSync(join(options.directory, ".independum"))).toBe(false);
  expect(effect).not.toHaveBeenCalled();
});

test("read runs an outside file worker without approval and refuses the state folder before reading", async () => {
  const { context, options } = fixture(false);
  const { createReadTool } = await import("./tools/create-read-tool.ts");
  const read = permissionTool(
    createReadTool({ texts: options.texts, getLimits: () => options.settings.outputLimits }),
    options,
  );
  const outside = join(context.cwd, "..", "outside.txt");
  writeFileSync(outside, "outside");
  const result = await read.execute("outside", { path: outside }, undefined, undefined, context);
  expect(result.content).toEqual([{ type: "text", text: "worker result" }]);
  expect(options.approvals.pending()).toEqual([]);
  const calls = vi.mocked(captureSandbox).mock.calls.length;
  const privateFile = join(options.directory, "private.txt");
  writeFileSync(privateFile, "private");
  await expect(
    read.execute("private", { path: privateFile }, undefined, undefined, context),
  ).rejects.toThrow("state folder is denied");
  expect(vi.mocked(captureSandbox).mock.calls).toHaveLength(calls);
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

test("removing a saved approval invalidates a waiting operation", async () => {
  const { tool, context, options, effect } = fixture();
  persistApprovals(options);
  const file = join(context.cwd, "..", "approved.txt");
  writeFileSync(file, "original");
  await options.saveApproval?.({
    chatId: context.sessionManager.getSessionId(),
    folder: context.cwd,
    binding: options.revision,
    project: context.cwd,
    resources: [{ kind: "path", path: file, scope: "file", access: "write" }],
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
  options.settings.permissions.savedApprovals = [];
  expect(
    await options.approvals.resolve(approval?.id ?? "", approval?.revision ?? "", "allow"),
  ).toBe(409);
  await failed;
  expect(effect).not.toHaveBeenCalled();
});
