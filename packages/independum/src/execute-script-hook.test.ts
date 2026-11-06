import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { expect, test, vi } from "vitest";
import { createHookTest } from "./create-hook-test.ts";
import { captureSandbox, sandboxRequest, sandboxRuntime } from "./create-sandbox.ts";
import { executeScriptHook } from "./execute-script-hook.ts";
import { canonicalPermissionPath } from "./permission-policy.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

vi.mock("./create-sandbox.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./create-sandbox.ts")>()),
  sandboxRuntime: vi.fn(() => ({
    backend: "processcontainer",
    runtimeHash: "test-runtime",
    readonlyPaths: [parse(process.execPath).root],
    unavailable: null,
  })),
  sandboxRequest: vi.fn(() => ({ command: "sandboxed" })),
  captureSandbox: vi.fn(async () => ({
    output: '{"apiVersion":1,"action":"continue"}',
    error: "",
    exitCode: 0,
    warnings: [],
  })),
}));

const parent = createTestFolder("execute-hook");

async function runScript(
  created: ReturnType<typeof createHookTest>,
  source = created.project,
): Promise<Awaited<ReturnType<typeof executeScriptHook>>> {
  return executeScriptHook(
    created.hook,
    created.input,
    new AbortController().signal,
    created.context,
    source,
    created.snapshots,
    created.options,
  );
}

test("scripts run without startup approval through the command boundary with protected configuration", async () => {
  const created = createHookTest(parent);
  const { input, project, options } = created;
  expect((await runScript(created)).exitCode).toBe(0);
  expect(captureSandbox).toHaveBeenLastCalledWith(
    expect.anything(),
    JSON.stringify(input),
    expect.any(AbortSignal),
    { outputLimitBytes: 16 * 1024 * 1024, errorLimitBytes: 1024 * 1024, timeoutMs: 10000 },
  );
  expect(sandboxRequest).toHaveBeenLastCalledWith(
    expect.objectContaining({
      runtime: expect.objectContaining({ readonlyPaths: [parse(process.execPath).root] }),
      paths: expect.arrayContaining([
        {
          kind: "path",
          path: canonicalPermissionPath(project, project),
          scope: "tree",
          access: "write",
        },
      ]),
      readonlyPaths: [canonicalPermissionPath(join(project, ".independum"), project)],
      deniedPaths: [canonicalPermissionPath(options.directory, project)],
      network: false,
    }),
    expect.any(String),
    project,
    expect.any(Object),
  );
  expect(sandboxRuntime).toHaveBeenLastCalledWith(process.execPath, "minimal", expect.any(Array));
  expect(options.approvals.pending()).toEqual([]);
});

test("outside source scripts need no approval unless a read rule asks for it", async () => {
  const created = createHookTest(parent);
  const { hook, project, options } = created;
  const source = join(dirname(project), "source");
  mkdirSync(source);
  const script = join(source, "hook.ts");
  writeFileSync(script, "process.stdout.write('result');");
  hook.run = { command: [process.execPath, script], workingDirectory: "source" };
  await runScript(created, source);
  const call = vi.mocked(sandboxRequest).mock.lastCall;
  expect(call?.[2]).toBe(source);
  for (const [path, scope] of [
    [source, "tree"],
    [script, "file"],
  ] as const) {
    expect(call?.[0].paths).toContainEqual({
      kind: "path",
      path: canonicalPermissionPath(path, project),
      scope,
      access: "read",
    });
  }
  options.settings.permissions.rules.push({
    id: "askSource",
    effect: "ask",
    project,
    resource: { kind: "path", path: source, scope: "tree", access: "read" },
  });
  const before = vi.mocked(captureSandbox).mock.calls.length;
  await expect(runScript(created, source)).rejects.toThrow("permission");
  expect(vi.mocked(captureSandbox).mock.calls.length).toBe(before);
  expect(options.approvals.pending()).toEqual([]);
});

test("unrestricted mode never bypasses script isolation", async () => {
  const created = createHookTest(parent);
  created.options.settings.permissions.mode = "unrestricted";
  const before = vi.mocked(captureSandbox).mock.calls.length;
  await expect(runScript(created)).rejects.toThrow("project permission mode");
  expect(vi.mocked(captureSandbox).mock.calls.length).toBe(before);
});

test("scripts cannot run from the denied state folder", async () => {
  const created = createHookTest(parent);
  const script = join(created.options.directory, "hook.ts");
  writeFileSync(script, "process.stdout.write('result');");
  created.hook.run.command = [process.execPath, script];
  const before = vi.mocked(captureSandbox).mock.calls.length;
  await expect(runScript(created)).rejects.toThrow("state folder is denied");
  expect(vi.mocked(captureSandbox).mock.calls.length).toBe(before);
  expect(created.snapshots.size).toBe(0);
});

test("scripts refuse projects inside the denied state folder before creating configuration", async () => {
  const created = createHookTest(parent);
  const { context, options } = created;
  context.cwd = canonicalPermissionPath(options.directory, options.directory);
  await expect(runScript(created)).rejects.toThrow("inside Independum's denied state folder");
  expect(existsSync(join(context.cwd, ".independum"))).toBe(false);
});

test("changed entry scripts refuse until the explicit reload clears captured fingerprints", async () => {
  const created = createHookTest(parent);
  await runScript(created);
  const before = vi.mocked(captureSandbox).mock.calls.length;
  writeFileSync(created.script, "process.stdout.write('changed');");
  await expect(runScript(created)).rejects.toThrow("Reload scripts");
  expect(vi.mocked(captureSandbox).mock.calls.length).toBe(before);
  created.snapshots.clear();
  await expect(runScript(created)).resolves.toMatchObject({ exitCode: 0 });
});
