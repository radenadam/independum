import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import {
  type ExtensionToolContext,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { getPlatformSupport, MxcError } from "@microsoft/mxc-sdk/v1";
import { expect, type TestContext, test } from "vitest";
import { commandEnvironment } from "./command-environment.ts";
import { createApprovals } from "./create-approvals.ts";
import {
  captureSandbox,
  type SandboxLaunch,
  sandboxCommand,
  sandboxRequest,
  sandboxRuntime,
} from "./create-sandbox.ts";
import { createModelTexts } from "./model-texts.ts";
import { canonicalPermissionPath, containsPermissionPath } from "./permission-policy.ts";
import { permissionTool } from "./permission-tool.ts";
import { builtInSettings } from "./read-settings-change.ts";
import { createEditTool } from "./tools/create-edit-tool.ts";
import { createReadTool } from "./tools/create-read-tool.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";
import { createWriteTool } from "./tools/create-write-tool.ts";
import { findShell } from "./tools/find-shell.ts";
import { runCommand } from "./tools/run-command.ts";

const root = createTestFolder("sandbox-native");
const environment = commandEnvironment("minimal", {});

async function execute(
  launch: SandboxLaunch,
  folder: string,
  script: string,
): Promise<{ output: string; error: string; exitCode: number }> {
  return captureSandbox(
    sandboxRequest(
      launch,
      sandboxCommand(globalThis.process.execPath, ["-e", script]),
      folder,
      environment,
    ),
  );
}

async function supported(
  context: TestContext,
): Promise<{ project: string; outside: string; launch: SandboxLaunch }> {
  const support = getPlatformSupport();
  if (!support.isSupported) {
    context.skip(`Operating system sandbox unsupported: ${support.reason ?? "No backend."}`);
  }
  const project = join(root, context.task.id.replaceAll(/[^a-z0-9]/gi, ""));
  mkdirSync(project);
  const outside = join(root, `${context.task.id.replaceAll(/[^a-z0-9]/gi, "")}-outside.txt`);
  writeFileSync(outside, "outside sentinel");
  const runtime = sandboxRuntime(process.execPath, "minimal", Object.keys(environment));
  const launch: SandboxLaunch = {
    runtime,
    paths: [{ kind: "path", path: project, scope: "tree", access: "write" }],
    deniedPaths: [],
    network: false,
  };
  let preflight: Awaited<ReturnType<typeof execute>>;
  try {
    preflight = await execute(launch, project, 'process.stdout.write("ready")');
  } catch (error) {
    if (
      runtime.unavailable !== null ||
      (error instanceof MxcError &&
        ["backend_error", "backend_unavailable", "unsupported_containment"].includes(error.code))
    ) {
      context.skip(
        `Sandbox setup fails before the native test: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    throw error;
  }
  if (
    preflight.exitCode !== 0 &&
    /bwrap:.*(namespace|permitted|permission|sandbox)/is.test(preflight.error)
  ) {
    context.skip(`Nested bubblewrap setup fails: ${preflight.error}`);
  }
  expect(preflight).toMatchObject({ output: "ready", exitCode: 0 });
  return { project, outside, launch };
}

test("native sandbox permits project writes and rejects outside reads and writes", async (context) => {
  const { project, outside, launch } = await supported(context);
  const file = join(project, "inside.txt");
  const created = `${outside}-created`;
  const result = await execute(
    launch,
    project,
    `const fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(file)}, 'inside'); try { process.stdout.write(fs.readFileSync(${JSON.stringify(outside)}, 'utf8')); } catch (error) { process.stdout.write('read denied ' + error.code); } for (const path of ${JSON.stringify([outside, created])}) { try { fs.writeFileSync(path, 'changed'); } catch {} }`,
  );
  expect(readFileSync(outside, "utf8")).toBe("outside sentinel");
  expect(existsSync(created)).toBe(false);
  expect(result.exitCode).toBe(0);
  expect(result.output).toMatch(/^read denied [A-Z]+$/);
  expect(result.output).not.toContain("outside sentinel");
  expect(readFileSync(file, "utf8")).toBe("inside");
}, 30_000);

test("native sandbox rejects project links to outside files and keeps detached descendants restricted", async (context) => {
  const { project, outside, launch } = await supported(context);
  const linked = join(project, "linked");
  const outsideFolder = join(root, "linked-outside");
  mkdirSync(outsideFolder, { recursive: true });
  const target = join(outsideFolder, "sentinel.txt");
  writeFileSync(target, "linked sentinel");
  const created = `${outside}-created`;
  symlinkSync(outsideFolder, linked, process.platform === "win32" ? "junction" : "dir");
  const result = await execute(
    launch,
    project,
    `const fs = require('node:fs'); try { process.stdout.write(fs.readFileSync(${JSON.stringify(join(linked, "sentinel.txt"))}, 'utf8')); } catch { process.stdout.write('link denied\\n'); } const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(`const fs = require('node:fs'); for (const path of ${JSON.stringify([outside, created, join(linked, "sentinel.txt")])}) { try { fs.writeFileSync(path, 'escaped'); } catch {} }`)}], { detached: true, stdio: 'ignore' }); child.on('error', error => { throw error; }); child.on('exit', code => { process.stdout.write('child ' + code); });`,
  );
  expect(readFileSync(outside, "utf8")).toBe("outside sentinel");
  expect(readFileSync(target, "utf8")).toBe("linked sentinel");
  expect(existsSync(created)).toBe(false);
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain("link denied");
  expect(result.output).toContain("child 0");
}, 30_000);

test("native file grants expose the approved file without exposing its neighbor", async (context) => {
  const { project, outside, launch } = await supported(context);
  const neighbor = join(root, "ungranted-neighbor.txt");
  writeFileSync(neighbor, "neighbor sentinel");
  launch.paths.push({ kind: "path", path: outside, scope: "file", access: "read" });
  const result = await execute(
    launch,
    project,
    `const fs = require('node:fs'); process.stdout.write(fs.readFileSync(${JSON.stringify(outside)}, 'utf8')); try { process.stdout.write(fs.readFileSync(${JSON.stringify(neighbor)}, 'utf8')); } catch { process.stdout.write(' neighbor denied'); }`,
  );
  expect(result.output).toBe("outside sentinel neighbor denied");
}, 30_000);

test("native nested readonly configuration permits reads and rejects writes inside a writable project", async (context) => {
  const { project, launch } = await supported(context);
  const configuration = join(project, ".independum");
  mkdirSync(configuration);
  const file = join(configuration, "settings.json");
  writeFileSync(file, "protected sentinel");
  launch.readonlyPaths = [configuration];
  const result = await execute(
    launch,
    project,
    `const fs = require('node:fs'); process.stdout.write(fs.readFileSync(${JSON.stringify(file)}, 'utf8')); for (const action of [() => fs.writeFileSync(${JSON.stringify(file)}, 'changed'), () => fs.writeFileSync(${JSON.stringify(join(configuration, "new.json"))}, 'new'), () => fs.renameSync(${JSON.stringify(configuration)}, ${JSON.stringify(join(project, "moved"))})]) { try { action(); process.stdout.write('ALLOWED'); } catch (error) { process.stdout.write(' denied ' + error.code); } } fs.writeFileSync(${JSON.stringify(join(project, "allowed.txt"))}, 'allowed');`,
  );
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain("protected sentinel");
  expect(result.output).not.toContain("ALLOWED");
  expect(result.output.match(/ denied /g)).toHaveLength(3);
  expect(readFileSync(file, "utf8")).toBe("protected sentinel");
  expect(readFileSync(join(project, "allowed.txt"), "utf8")).toBe("allowed");
}, 30_000);

test("linux compiles nested readonly configuration without denied mounts", () => {
  const { project } = createTestProject(root, true);
  const configuration = join(project, ".independum");
  mkdirSync(configuration);
  const runtime = sandboxRuntime(process.execPath, "minimal", Object.keys(environment));
  const request = sandboxRequest(
    {
      runtime: { ...runtime, backend: "bubblewrap", unavailable: null },
      paths: [
        { kind: "path", path: project, scope: "tree", access: "write" },
        { kind: "path", path: configuration, scope: "tree", access: "write" },
      ],
      readonlyPaths: [canonicalPermissionPath(configuration, project)],
      deniedPaths: [],
      network: false,
    },
    "never executed",
    project,
    environment,
  );
  expect(request.filesystem?.readwritePaths).toEqual([project]);
  expect(request.filesystem?.readonlyPaths).toContain(
    canonicalPermissionPath(configuration, project),
  );
  expect(request.filesystem?.deniedPaths).toEqual([]);
});

test("native exclusions protect configuration created after the sandbox starts", async (context) => {
  const { project, launch } = await supported(context);
  const configuration = join(project, ".independum");
  launch.deniedPaths.push(configuration);
  if (launch.runtime.backend === "bubblewrap") {
    expect(() => sandboxRequest(launch, "never executed", project, environment)).toThrow("masking");
    return;
  }
  const policy = join(configuration, "settings.json");
  const result = await execute(
    launch,
    project,
    `const fs = require('node:fs'); try { fs.mkdirSync(${JSON.stringify(configuration)}, { recursive: true }); fs.writeFileSync(${JSON.stringify(policy)}, 'widened'); process.stdout.write('ALLOWED'); } catch (error) { process.stdout.write('denied ' + error.code); }`,
  );
  expect(result.output).toContain("denied");
  expect(result.output).not.toContain("ALLOWED");
  expect(existsSync(policy)).toBe(false);
}, 30_000);

test("native sandbox denies loopback access without a network grant", async (context) => {
  const { project, launch } = await supported(context);
  const server = createServer((socket) => socket.end("connected"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("The test service needs a loopback port.");
    }
    const result = await execute(
      launch,
      project,
      `const socket = require('node:net').connect(${address.port}, '127.0.0.1'); socket.setTimeout(1000); socket.on('connect', () => { process.stdout.write('ALLOWED'); socket.destroy(); }); socket.on('error', error => process.stdout.write('denied ' + error.code)); socket.on('timeout', () => { process.stdout.write('denied timeout'); socket.destroy(); });`,
    );
    expect(result.output).not.toContain("ALLOWED");
    expect(result.output).toContain("denied");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
}, 30_000);

test("sandboxed shell preserves the original script and the selected shell exit code", async (context) => {
  const { project, launch } = await supported(context);
  const shell = findShell(undefined, true);
  if (shell === undefined) {
    throw new Error("The supported sandbox test requires its platform shell.");
  }
  launch.runtime = sandboxRuntime(shell.path, "minimal", Object.keys(environment));
  let output = "";
  const end = await runCommand({
    shell,
    command: 'echo "literal $ punctuation"\nexit 3',
    folder: project,
    environment: {},
    environmentMode: "minimal",
    timeoutMs: 5000,
    signal: undefined,
    sandbox: launch,
    onOutput: (text) => {
      output += text;
    },
  });
  expect(output).toContain("literal $ punctuation");
  expect(end.exitCode).toBe(3);
}, 30_000);

test("unrepresentable linux exclusions refuse without masking or launching a command", () => {
  const project = root;
  const runtime = {
    ...sandboxRuntime(process.execPath, "minimal", []),
    backend: "bubblewrap" as const,
    unavailable: null,
  };
  expect(() =>
    sandboxRequest(
      {
        runtime,
        paths: [{ kind: "path", path: project, scope: "tree", access: "write" }],
        deniedPaths: [join(project, ".independum")],
        network: false,
      },
      "never executed",
      project,
      {},
    ),
  ).toThrow("masking");
});

// biome-ignore-start lint/style/useNamingConvention: Edit names its model-facing parameters.
test("restricted file workers preserve fingerprints and refuse outside link races", async (context) => {
  const { project, outside } = await supported(context);
  const settings = structuredClone(builtInSettings);
  const fileRuntime = sandboxRuntime(
    process.execPath,
    settings.permissions.environment,
    Object.keys(environment),
    true,
  );
  settings.permissions.runtimeApprovals.push({
    backend: fileRuntime.backend,
    runtimeHash: fileRuntime.runtimeHash,
    approvedAt: new Date().toISOString(),
  });
  const texts = createModelTexts(() => settings.texts);
  const approvals = createApprovals();
  const manager = SessionManager.inMemory(project);
  const toolContext = { cwd: project, sessionManager: manager } as unknown as ExtensionToolContext;
  const options: Parameters<typeof permissionTool>[1] = {
    settings,
    texts,
    directory: join(root, "state"),
    shell: undefined,
    approvals,
    launches: new Map(),
    profileName: "Default",
    revision: "native-file-test",
    currentRevision: () => "native-file-test",
    isInteractive: () => true,
    audit: () => undefined,
  };
  const tools = [
    createReadTool({ texts, getLimits: () => settings.outputLimits }),
    createEditTool(texts),
    createWriteTool(texts),
  ].map((tool) => permissionTool(tool, options));
  let nextId = 0;
  async function call(
    name: string,
    input: Record<string, unknown>,
    canApprove = true,
  ): Promise<Awaited<ReturnType<ToolDefinition["execute"]>>> {
    const tool = tools.find((entry) => entry.name === name);
    if (tool === undefined) {
      throw new Error("The native test needs the selected file tool.");
    }
    nextId += 1;
    const id = `file-${nextId}`;
    const result = await tool.execute(
      id,
      input,
      undefined,
      (update) => {
        const details = update.details as {
          approval?: { id: string; revision: string; resources: { kind: string; path?: string }[] };
        };
        if (details.approval !== undefined) {
          const hasOutside = details.approval.resources.some(
            (resource) =>
              resource.kind === "path" &&
              resource.path !== undefined &&
              !containsPermissionPath(project, resource.path),
          );
          approvals.resolve(
            details.approval.id,
            details.approval.revision,
            canApprove && !hasOutside ? "allow" : "deny",
          );
        }
      },
      toolContext,
    );
    manager.appendMessage({
      role: "toolResult",
      toolCallId: id,
      toolName: name,
      content: result.content,
      details: JSON.parse(JSON.stringify(result.details ?? null)),
      isError: false,
      timestamp: Date.now(),
    });
    return result;
  }
  const file = join(project, "file.txt");
  writeFileSync(file, "one\ntwo\n");
  expect((await call("Read", { path: file })).details).toHaveProperty("fingerprint");
  await call("Edit", { path: file, old_string: "two", new_string: "three" });
  await call("Write", { path: file, content: "four\n" });
  expect(readFileSync(file, "utf8")).toBe("four\n");
  const local = join(project, "local");
  const external = join(root, "race-external");
  mkdirSync(local);
  mkdirSync(external);
  writeFileSync(join(local, "file.txt"), "local");
  const sentinel = join(external, "file.txt");
  writeFileSync(sentinel, "outside race sentinel");
  const link = join(project, "changing");
  let isOutside = false;
  function replaceLink(): void {
    try {
      rmSync(link, { force: true, recursive: true });
      symlinkSync(
        isOutside ? external : local,
        link,
        process.platform === "win32" ? "junction" : "dir",
      );
      isOutside = !isOutside;
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          ["EPERM", "EACCES", "EBUSY"].includes(String(error.code))
        )
      ) {
        throw error;
      }
    }
  }
  replaceLink();
  const timer = setInterval(replaceLink, 10);
  try {
    for (const name of ["Read", "Write", "Edit"]) {
      let result: Awaited<ReturnType<typeof call>> | undefined;
      try {
        result = await call(
          name,
          {
            path: join(link, "file.txt"),
            content: "changed",
            old_string: "local",
            new_string: "changed",
          },
          false,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
      if (result !== undefined) {
        expect(JSON.stringify(result.content)).not.toContain("outside race sentinel");
      }
      expect(readFileSync(sentinel, "utf8")).toBe("outside race sentinel");
    }
  } finally {
    clearInterval(timer);
  }
  expect(readFileSync(outside, "utf8")).toBe("outside sentinel");
}, 60_000);
// biome-ignore-end lint/style/useNamingConvention: Edit names its model-facing parameters.
