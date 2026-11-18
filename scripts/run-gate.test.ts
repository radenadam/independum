import { ChildProcess, execFileSync, spawn } from "node:child_process";
import { type BigIntStats, lstatSync, readlinkSync } from "node:fs";
import {
  access,
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestBrowserReport } from "./create-test-browser-report.ts";
import type { GateResult, GateTask } from "./gate-contract.ts";
import { gateFileSystem } from "./gate-file-system.ts";
import { browserRegressionTests } from "./read-gate-browser-checks.ts";
import { readRevision } from "./read-revision.ts";
import type { TestAvailability } from "./read-test-availability.ts";
import { runGate } from "./run-gate.ts";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));

const fileSwap = vi.hoisted(() => ({ path: "", replacement: "" }));

vi.mock("node:fs", async (original) => {
  const filesystem = await original<typeof import("node:fs")>();
  return {
    ...filesystem,
    writeFileSync: vi.fn((...arguments_: Parameters<typeof filesystem.writeFileSync>) => {
      if (!/[\\/]independum-gate[\\/]latest\.json$/.test(String(arguments_[0]))) {
        filesystem.writeFileSync(...arguments_);
      }
    }),
    // A test moves another file over this path after the gate inspects it and before the gate
    // opens it.
    openSync: (...arguments_: Parameters<typeof filesystem.openSync>) => {
      if (String(arguments_[0]) === fileSwap.path) {
        fileSwap.path = "";
        filesystem.renameSync(fileSwap.replacement, String(arguments_[0]));
      }
      return filesystem.openSync(...arguments_);
    },
  };
});

const folder = resolve(import.meta.dirname, "..");
const directories: string[] = [];
const secret = "FIXTURE_SECRET=outside-the-repository";
const engines = ["codex", "claude"];

beforeEach(() => {
  vi.mocked(spawn).mockClear();
});

afterEach(async () => {
  fileSwap.path = "";
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  process.exitCode = 0;
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

test("combined gates collect current browser evidence and qa despite incomplete review", async () => {
  const fixture = await prepareGate("incomplete");
  fixture.arguments.push("--browser", "chrome");
  await runGate(fixture.arguments);
  const receipt = await fixture.receipt();
  expect(fixture.scenarios).toEqual(fixture.task.scenarios);
  expect(receipt.roles.map((role) => role.role)).toEqual(["review", "qa"]);
  expect(receipt.verdict).toBe("incomplete");
  expect(receipt.testAvailability).toEqual(
    browserRegressionTests.map((test) => ({
      ...test,
      status: "skipped",
      reason: "The gate runs this browser regression separately.",
    })),
  );
  expect(fixture.prompts.at(-1)).toContain("revision.json");
  expect(fixture.prompts[0]).toContain("browser-checks.json");
  expect(fixture.prompts[0]).toContain("use no other id in coverage");
  expect(fixture.prompts[0]).toContain("cite the revision.json of every task scenario");
  expect(fixture.prompts[0]).toContain("An empty browser.jsonl means the browser logged no errors");
  expect(fixture.prompts[0]).toContain("must match a direct learning entry of the task");
  for (const prompt of fixture.prompts) {
    expect(prompt).toContain(
      "Any finding prevents a pass, so record passing observations and justifications in coverage",
    );
  }
  expect(fixture.prompts.at(-1)).toContain(
    "justify the chosen browser scope against acceptance in the coverage observations",
  );
  expect(fixture.prompts[0]).toContain("browser-regressions.json");
  expect(fixture.prompts[0]).toContain(
    "its Linux and macOS runners execute the native sandbox tests",
  );
  const regressionCall = vi
    .mocked(spawn)
    .mock.calls.find(([, parameters]) => (parameters as string[]).includes("vitest"));
  expect(regressionCall?.[2]?.env?.INDEPENDUM_QA_BROWSER).toBe("chrome");
  const regressions = JSON.parse(
    await readFile(join(fixture.directory(), "browser-regressions.json"), "utf8"),
  );
  expect(regressions.revision).toEqual(receipt.roles[0]?.revision);
  expect(
    JSON.parse(await readFile(regressions.report, "utf8")).passedTests.map(
      (test: { name: string }) => test.name,
    ),
  ).toEqual(browserRegressionTests.map((test) => test.name));
  const calls = vi.mocked(spawn).mock.calls;
  expect(calls.findIndex(([executable]) => executable === "codex")).toBeGreaterThan(
    calls.findLastIndex(([, parameters]) =>
      (parameters as string[]).includes(fixture.task.scenarios.at(-1) ?? ""),
    ),
  );
  const browserCalls = vi
    .mocked(spawn)
    .mock.calls.filter(([, parameters]) =>
      (parameters as string[]).some((parameter) => fixture.task.scenarios.includes(parameter)),
    );
  for (const [executable, parameters] of browserCalls) {
    expect(executable).toBe(process.execPath);
    expect(parameters).toEqual(expect.arrayContaining(["--base", "--browser", "chrome"]));
  }
});

test.each(engines)("runner pins %s identity and overrides role guesses", async (engine) => {
  const fixture = await prepareGate("pass", engine);
  await runGate(fixture.arguments);
  const receipt = await fixture.receipt();
  expect(receipt.verdict).toBe("pass");
  expect(receipt.roles).toHaveLength(2);
  for (const role of receipt.roles) {
    expect(role).toMatchObject({ engine, model: "concrete-model-id" });
  }
  const agentCalls = vi.mocked(spawn).mock.calls.filter(([name]) => name === engine);
  expect(agentCalls).toHaveLength(2);
  for (const [, parameters] of agentCalls) {
    expect(parameters).toEqual(expect.arrayContaining(["--model", "concrete-model-id"]));
    expect(parameters).not.toContain("danger-full-access");
  }
  expect(fixture.prompts[1]).toContain("browser-checks.json");
});

test("failed scenarios preserve evidence run later scenarios and prevent a pass", async () => {
  const fixture = await prepareGate("pass", "codex", { hasScenarioFailure: true });
  await runGate(fixture.arguments);
  const receipt = await fixture.receipt();
  expect(receipt.verdict).toBe("fail");
  expect(await readFile(join(fixture.directory(), "browser-checks.json"), "utf8")).toContain(
    '"fail"',
  );
  expect(receipt.roles[0]?.verdict).toBe("pass");
  expect(receipt.roles[1]?.role).toBe("qa");
  expect(fixture.scenarios).toEqual(fixture.task.scenarios);
});

test("invalid review commands do not suppress browser execution or qa evidence", async () => {
  const fixture = await prepareGate("pass", "codex", { hasReviewCommandFailure: true });
  await runGate(fixture.arguments);
  const receipt = await fixture.receipt();
  expect(fixture.scenarios).toEqual(fixture.task.scenarios);
  expect(receipt.roles.map((role) => role.verdict)).toEqual(["incomplete", "pass"]);
  expect(receipt.verdict).toBe("incomplete");
});

test("stale browser captures prevent passing even when both agents claim pass", async () => {
  const fixture = await prepareGate("pass", "codex", { hasStaleCapture: true });
  await runGate(fixture.arguments);
  expect((await fixture.receipt()).verdict).toBe("incomplete");
  expect(fixture.scenarios).toEqual(fixture.task.scenarios);
});

test("standalone qa runs task scenarios before independent assessment", async () => {
  const fixture = await prepareGate("pass");
  fixture.arguments[0] = "qa";
  await runGate(fixture.arguments);
  const receipt = await fixture.receipt();
  expect(receipt.verdict).toBe("pass");
  expect(fixture.scenarios).toEqual(fixture.task.scenarios);
  expect(receipt.roles.map((role) => role.role)).toEqual(["qa"]);
});

test("missing and unknown model choices cannot start a gate", async () => {
  for (const model of [undefined, "unknown", "default"]) {
    const fixture = await prepareGate("pass");
    fixture.arguments.splice(-2);
    if (model !== undefined) {
      fixture.arguments.push("--model", model);
    }
    await expect(runGate(fixture.arguments)).rejects.toThrow("concrete CLI model");
    expect(spawn).not.toHaveBeenCalled();
  }
});

test.each([
  undefined,
  {
    completed: true,
    tests: [
      {
        file: "shell.test.ts",
        name: "command execution",
        status: "unavailable",
        reason: "The default shell is unavailable.",
      },
    ],
  },
  ...[undefined, ["linux", "darwin"]].map((ciPlatforms) => ({
    completed: true,
    tests: [
      {
        file: "packages/independum/src/create-sandbox.test.ts",
        name: "native sandbox runs a node script by path",
        status: "skipped",
        reason: "Native containment is unavailable.",
        ...(ciPlatforms === undefined ? {} : { ciPlatforms }),
      },
    ],
  })),
])("missing unavailable or skipped test evidence %j blocks passing roles", async (report) => {
  const fixture = await prepareGate("pass", "codex", {
    testReport: report,
    hasTestReportOverride: true,
  });
  await runGate(fixture.arguments);
  const receipt = await fixture.receipt();
  expect(receipt.roles.map((role) => role.verdict)).toEqual(["pass", "pass"]);
  expect(receipt.verdict).toBe("fail");
  expect(receipt.testAvailability).toEqual(
    report?.tests ?? [
      expect.objectContaining({ status: "unavailable", reason: expect.any(String) }),
    ],
  );
});

test.each(["missing", "skipped", "failed", "stale"])(
  "%s browser regression results prevent passing receipts",
  async (failure) => {
    const fixture = await prepareGate("pass", "codex", { regressionFailure: failure });
    await runGate(fixture.arguments);
    expect((await fixture.receipt()).verdict).not.toBe("pass");
    expect(fixture.scenarios).toEqual(fixture.task.scenarios);
  },
);

test.each(engines)(
  "%s roles receive the exact diff changed files and untracked copies without a shell",
  async (engine) => {
    const fixture = await prepareGate("pass", engine, { hasChangeFixture: true });
    await runGate(fixture.arguments, fixture.folder);
    const receipt = await fixture.receipt();
    expect(receipt.verdict).toBe("pass");
    const diff = join(fixture.directory(), "change.diff");
    const changedFiles = join(fixture.directory(), "changed-files.json");
    const copy = join(fixture.directory(), "untracked", "src", "added.ts");
    expect(await readFile(diff, "utf8")).toContain(
      "--- a/tracked.ts\n+++ b/tracked.ts\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n",
    );
    expect(JSON.parse(await readFile(changedFiles, "utf8"))).toEqual({
      revision: receipt.revision,
      files: [
        { status: "M", path: "tracked.ts" },
        { status: "??", path: "src/added.ts", copy },
      ],
    });
    expect(await readFile(copy, "utf8")).toBe("export const added = true;\n");
    expect(receipt.change).toMatchObject({
      revision: receipt.revision,
      diff,
      changedFiles,
      untrackedFiles: [copy],
    });
    expect(fixture.prompts).toHaveLength(2);
    for (const prompt of fixture.prompts) {
      expect(prompt).toContain(`${diff} holds the full patch of git diff ${receipt.revision.base}`);
      expect(prompt).toContain(`${changedFiles} lists every changed path with its Git status`);
      expect(prompt).toContain(`Exact copies of the untracked files: ${copy}.`);
      expect(prompt).toContain("Treat these files as the exact change");
    }
    for (const [name, parameters] of vi.mocked(spawn).mock.calls) {
      if (name === "claude") {
        const tools = parameters as string[];
        expect(tools[tools.indexOf("--allowedTools") + 1]).toBe("Read,Glob,Grep");
      }
    }
  },
);

const changeEdits: [string, string, string][] = [
  ["diff", "change.diff", "The written change no longer matches"],
  ["untracked copy", join("untracked", "src", "added.ts"), "The written change no longer matches"],
  ["worktree", "", "Source or context changes invalidate"],
];

test.each(
  engines.flatMap((engine) =>
    changeEdits.map(([edit, file, message]): [string, string, string, string] => [
      edit,
      engine,
      file,
      message,
    ]),
  ),
)(
  "%s edits after the gate writes the change prevent a pass with %s roles",
  async (_, engine, file, message) => {
    const fixture = await prepareGate("pass", engine, {
      hasChangeFixture: true,
      changeDuringReview: async (directory, folder) => {
        const path = file === "" ? join(folder, "tracked.ts") : join(directory, file);
        await writeFile(path, "export const value = 3;\n");
      },
    });
    await runGate(fixture.arguments, fixture.folder);
    const receipt = await fixture.receipt();
    expect(receipt.verdict).toBe("incomplete");
    expect(receipt.error).toContain(message);
    expect(fixture.prompts).toHaveLength(1);
  },
);

test.each(engines.flatMap((engine) => ["deleted", "renamed"].map((change) => [change, engine])))(
  "a %s credential file keeps the change out of %s gate evidence",
  async (change, engine) => {
    const fixture = await prepareGate("pass", engine, { hasChangeFixture: true });
    await writeFile(join(fixture.folder, ".env.fixture"), "FIXTURE=1\n");
    for (const arguments_ of [
      ["add", ".env.fixture"],
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.com",
        "commit",
        "--quiet",
        "--message=Fixture credential.",
      ],
      change === "deleted"
        ? ["rm", "--quiet", ".env.fixture"]
        : ["mv", ".env.fixture", "settings.txt"],
    ]) {
      execFileSync("git", arguments_, { cwd: fixture.folder, stdio: "ignore" });
    }
    await runGate(fixture.arguments, fixture.folder);
    await expectRefusalBeforeChange(
      fixture,
      "Credential files cannot participate in gate evidence.",
    );
  },
);

test.each(engines)(
  "%s gates record an untracked symbolic link as its target path and fingerprint it by that path",
  async (engine) => {
    const credential = await createOutsideFile(".env.fixture");
    // Git lists this regular file, and the gate sees it as a link whose target holds the secret.
    const fixture = await prepareChangedGate(engine, (worktree) => {
      simulateLink(join(worktree, "notes.txt"), credential);
      return writeFile(join(worktree, "notes.txt"), `${secret}\n`);
    });
    const notes = join(fixture.folder, "notes.txt");
    await runGate(fixture.arguments, fixture.folder);
    const revision = await expectRecordedLink(fixture, "notes.txt", credential);
    await writeFile(notes, "FIXTURE_SECRET=changed\n");
    expect(readRevision(fixture.folder, "HEAD")).toEqual(revision);
    simulateLink(notes, `${credential}.moved`);
    expect(readRevision(fixture.folder, "HEAD").fingerprint).not.toBe(revision.fingerprint);
  },
);

test.each(engines)(
  "an untracked folder link never puts the files behind it into %s gate evidence",
  async (engine) => {
    const target = dirname(await createOutsideFile("settings.txt"));
    // A junction needs no privilege on Windows, and elsewhere this creates a folder symbolic link.
    const fixture = await prepareChangedGate(engine, (worktree) =>
      symlink(target, join(worktree, "linked"), "junction"),
    );
    await runGate(fixture.arguments, fixture.folder);
    if (process.platform === "win32") {
      // Git for Windows reads a junction as a folder and lists the files behind it.
      await expectRefusal(fixture, '"linked/settings.txt", because a folder on its path is a link');
    } else {
      const revision = await expectRecordedLink(fixture, "linked", target);
      await writeFile(join(target, "settings.txt"), "FIXTURE_SECRET=changed\n");
      expect(readRevision(fixture.folder, "HEAD")).toEqual(revision);
    }
  },
);

test.each(engines)("a reading file behind a folder link stops %s gates", async (engine) => {
  const target = dirname(await createOutsideFile("notes.md"));
  const fixture = await prepareGate("pass", engine, {
    hasChangeFixture: true,
    changeWorktree: (worktree) => symlink(target, join(worktree, "src", "linked"), "junction"),
    reading: join("src", "linked", "notes.md"),
  });
  await expect(runGate(fixture.arguments, fixture.folder)).rejects.toThrow(
    `${JSON.stringify(fixture.task.reading[0])}, because a folder on its path is a link`,
  );
  expect(spawn).not.toHaveBeenCalled();
});

test.each(engines)(
  "an untracked hard link to a credential is refused before any %s role starts",
  async (engine) => {
    const credential = await createOutsideFile(".env.fixture");
    const fixture = await prepareChangedGate(engine, (worktree) =>
      link(credential, join(worktree, "notes.txt")),
    );
    await runGate(fixture.arguments, fixture.folder);
    await expectRefusalBeforeChange(
      fixture,
      '"notes.txt", because it has other hard links whose names cannot be checked',
    );
  },
);

test.each(engines)(
  "an untracked file replaced between inspection and copying is refused by %s gates",
  async (engine) => {
    const fixture = await prepareChangedGate(engine, (worktree) =>
      writeFile(join(worktree, "notes.txt"), "Harmless notes.\n"),
    );
    const notes = join(fixture.folder, "notes.txt");
    fileSwap.replacement = await createOutsideFile(".env.fixture");
    fileSwap.path = notes;
    await runGate(fixture.arguments, fixture.folder);
    expect(await readFile(notes, "utf8")).toBe(`${secret}\n`);
    await expectRefusal(fixture, '"notes.txt", because it changes between inspection and reading');
  },
);

test.each(engines)(
  "a multiply linked scenario file stops %s gates before any role starts",
  async (engine) => {
    const fixture = await prepareGate("pass", engine, {
      hasChangeFixture: true,
      linkedScenarioFile: await createOutsideFile(".env.fixture"),
    });
    await runGate(fixture.arguments, fixture.folder);
    await expectRefusal(
      fixture,
      'values.jsonl", because it has other hard links whose names cannot be checked',
    );
    expect(fixture.scenarios).toHaveLength(1);
  },
);

test.each(engines)(
  "scenario output behind a folder link stops %s gates before any role starts",
  async (engine) => {
    const fixture = await prepareGate("pass", engine, {
      hasChangeFixture: true,
      hasLinkedScenarioOutput: true,
    });
    await runGate(fixture.arguments, fixture.folder);
    await expectRefusal(fixture, "because a folder on its path is a link");
    expect(fixture.scenarios).toHaveLength(1);
  },
);

test.each(engines)(
  "learning owners of %s gates must be among the changed files including untracked files",
  async (engine) => {
    const unchanged = await prepareGate("pass", engine, {
      hasChangeFixture: true,
      learningOwner: ".gitignore",
    });
    await expect(runGate(unchanged.arguments, unchanged.folder)).rejects.toThrow(
      "Each learning entry must update its authoritative owner",
    );
    const untracked = await prepareGate("pass", engine, {
      hasChangeFixture: true,
      learningOwner: join("src", "added.ts"),
    });
    await runGate(untracked.arguments, untracked.folder);
    expect((await untracked.receipt()).verdict).toBe("pass");
  },
);

test.each(engines)(
  "%s change fixtures leave the repository that a hook's git variables name untouched",
  async (engine) => {
    const decoy = await mkdtemp(join(tmpdir(), "independum-run-gate-decoy-"));
    directories.push(decoy);
    const outside = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
    );
    execFileSync("git", ["init", "--quiet"], { cwd: decoy, stdio: "ignore", env: outside });
    const gitFolder = join(decoy, ".git");
    const config = await readFile(join(gitFolder, "config"), "utf8");
    vi.stubEnv("GIT_DIR", gitFolder);
    vi.stubEnv("GIT_INDEX_FILE", join(gitFolder, "index"));
    const fixture = await prepareGate("pass", engine, { hasChangeFixture: true });
    await runGate(fixture.arguments, fixture.folder);
    expect((await fixture.receipt()).verdict).toBe("pass");
    expect(await readFile(join(gitFolder, "config"), "utf8")).toBe(config);
    await expect(access(join(gitFolder, "index"))).rejects.toThrow();
  },
);

async function prepareGate(
  verdict: GateResult["verdict"],
  engine = "codex",
  options: {
    hasScenarioFailure?: boolean;
    hasStaleCapture?: boolean;
    hasReviewCommandFailure?: boolean;
    hasTestReportOverride?: boolean;
    testReport?: unknown;
    regressionFailure?: string;
    hasChangeFixture?: boolean;
    changeDuringReview?: (directory: string, folder: string) => Promise<void>;
    learningOwner?: string;
    changeWorktree?: (folder: string) => Promise<void>;
    linkedScenarioFile?: string;
    hasLinkedScenarioOutput?: boolean;
    reading?: string;
  } = {},
): Promise<{
  arguments: string[];
  folder: string;
  task: GateTask;
  scenarios: string[];
  prompts: string[];
  directory: () => string;
  receipt: () => Promise<{
    verdict: string;
    revision: GateResult["revision"];
    roles: GateResult[];
    testAvailability: TestAvailability[];
    change?: unknown;
    error?: string;
  }>;
}> {
  const root = await mkdtemp(join(tmpdir(), "independum-run-gate-"));
  directories.push(root);
  const gateFolder = options.hasChangeFixture ? await prepareChange(root) : folder;
  await options.changeWorktree?.(gateFolder);
  const owner =
    options.learningOwner === undefined ? undefined : join(gateFolder, options.learningOwner);
  const task: GateTask = {
    outcome: "Exercise coordinator gate orchestration.",
    base: "HEAD",
    requirements: ["CP-25"],
    acceptance: [{ id: "A1", behavior: "Gate evidence is complete." }],
    preservedBehavior: "Fail closed.",
    exclusions: "Product changes.",
    reading: [join(gateFolder, options.reading ?? "AGENTS.md")],
    writableFiles: owner === undefined ? [] : [owner],
    sharedFiles: [],
    capabilities: ["Coordinator browser and agent execution."],
    verificationOwner: "Coordinator",
    questionRound: "No new decision is needed.",
    isVisible: true,
    scenarios: [join(gateFolder, "qa", "welcome.json"), join(gateFolder, "qa", "settings.json")],
    learning:
      owner === undefined
        ? []
        : [
            {
              speaker: "Coordinator",
              date: "2026-11-18",
              source: "Gate fixture.",
              kind: "implementation",
              provenance: "inferred",
              concern: "The owner records the change.",
              owner,
              protection: join(gateFolder, "tracked.ts"),
            },
          ],
  };
  const taskPath = join(root, "task.json");
  await writeFile(taskPath, JSON.stringify(task));
  if (options.hasLinkedScenarioOutput) {
    await mkdir(join(root, "real"));
    await symlink(join(root, "real"), join(root, "linked"), "junction");
  }
  vi.stubEnv("npm_execpath", "fixture-pnpm.exe");
  const scenarios: string[] = [];
  const prompts: string[] = [];
  const captures: string[] = [];
  let directory = "";
  let revision: GateResult["revision"] = readRevision(gateFolder, task.base);
  let taskFingerprint = "";
  vi.mocked(spawn).mockImplementation((executable, parameters) => {
    const child = Object.assign(new ChildProcess(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      stdin: new PassThrough(),
    });
    let prompt = "";
    child.stdin.on("data", (chunk: Buffer) => {
      prompt += chunk.toString();
    });
    child.stdin.on("finish", () => {
      respond().then(
        (code) => child.emit("close", code),
        (error: unknown) => child.emit("error", error),
      );
    });
    async function respond(): Promise<number> {
      const report = (vi.mocked(spawn).mock.calls.at(-1)?.[2] as { env?: NodeJS.ProcessEnv })?.env
        ?.INDEPENDUM_TEST_REPORT;
      if ((parameters as string[]).includes("check") && report) {
        const availability = options.hasTestReportOverride
          ? options.testReport
          : {
              completed: true,
              tests: browserRegressionTests.map((test) => ({
                ...test,
                status: "skipped",
                reason: "The gate runs this browser regression separately.",
              })),
            };
        if (availability !== undefined) {
          await writeFile(report, JSON.stringify(availability));
        }
      }
      const arguments_ = parameters as string[];
      if (arguments_.includes("vitest") && report) {
        const unavailable = {
          ...browserRegressionTests[0],
          status: options.regressionFailure,
          reason: "Browser unavailable.",
        };
        if (options.regressionFailure !== "missing") {
          await writeFile(
            report,
            JSON.stringify({
              ...createTestBrowserReport(folder),
              tests:
                options.regressionFailure && options.regressionFailure !== "stale"
                  ? [unavailable]
                  : [],
            }),
          );
        }
        child.stdout.write("Real-browser regressions execute.\n");
        if (options.regressionFailure === "stale") {
          const metadataPath = join(report, "..", "browser-regressions.json");
          const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
          metadata.revision.fingerprint = "stale";
          await writeFile(metadataPath, JSON.stringify(metadata));
        }
      }
      if (executable === "codex" || executable === "claude") {
        prompts.push(prompt);
        revision = JSON.parse(
          prompt.match(/Copy this revision exactly: (\{[^\n]+?\})\./)?.[1] ?? "",
        );
        taskFingerprint = prompt.match(/Task fingerprint: ([a-f0-9]+)/)?.[1] ?? "";
        directory = prompt.match(/Evidence destination: (.+?)\. Do not edit/)?.[1] ?? "";
        const role = prompt.includes("independent review role") ? "review" : "qa";
        if (role === "review" && options.hasReviewCommandFailure) {
          return 1;
        }
        if (role === "review") {
          await options.changeDuringReview?.(directory, gateFolder);
        }
        const result = {
          role,
          verdict: role === "review" ? verdict : "pass",
          revision,
          taskFingerprint,
          engine: "role guess",
          model: "unknown",
          platform: "fixture",
          browser: "fixture",
          commands: ["Inspect evidence."],
          coverage: [
            {
              acceptanceId: "A1",
              observation: "Observed.",
              evidence: [taskPath, ...captures],
              isVerified: true,
            },
          ],
          findings: [],
          missingChecks:
            verdict === "incomplete" && role === "review" ? ["Review unavailable."] : [],
        };
        if (executable === "codex") {
          await writeFile(
            arguments_[arguments_.indexOf("--output-last-message") + 1] ?? "",
            JSON.stringify(result),
          );
        } else {
          child.stdout.write(`{"structured_output":${JSON.stringify(result)}}`);
        }
      } else {
        const scenario = arguments_.find((argument) => task.scenarios.includes(argument));
        if (scenario !== undefined) {
          scenarios.push(scenario);
          const output = await mkdtemp(
            join(root, options.hasLinkedScenarioOutput ? "linked" : "", "browser-"),
          );
          child.stdout.write(`QA output: ${output}\n`);
          const capture = { ...revision, scenario, driver: "playwright-core" };
          if (options.hasStaleCapture) {
            capture.fingerprint = "stale";
          }
          for (const [file, text] of Object.entries({
            "revision.json": JSON.stringify(capture),
            "scenario.json": "{}",
            "values.jsonl": '{"step":1,"value":{"observed":true}}\n',
            "browser.jsonl": "",
            "observed.png": "fixture screenshot",
          })) {
            const path = join(output, file);
            if (file === "values.jsonl" && options.linkedScenarioFile !== undefined) {
              await link(options.linkedScenarioFile, path);
            } else {
              await writeFile(path, text);
            }
            if (text !== "") {
              captures.push(path);
            }
          }
          if (options.hasScenarioFailure && scenarios.length === 1) {
            await writeFile(join(output, "failure.txt"), "Scenario fails.");
            return 1;
          }
        }
      }
      return 0;
    }
    return child;
  });
  return {
    arguments: [
      "gate",
      "--task",
      taskPath,
      "--output",
      root,
      "--engine",
      engine,
      "--model",
      "concrete-model-id",
    ],
    folder: gateFolder,
    task,
    scenarios,
    prompts,
    directory: () => directory,
    receipt: async () => JSON.parse(await readFile(join(directory, "receipt.json"), "utf8")),
  };
}

/** Prepares a passing change fixture with one more worktree change. */
function prepareChangedGate(
  engine: string,
  changeWorktree: (folder: string) => Promise<void>,
): ReturnType<typeof prepareGate> {
  return prepareGate("pass", engine, { hasChangeFixture: true, changeWorktree });
}

/** Makes the gate see one regular file as a symbolic link to a target without a host privilege. */
function simulateLink(path: string, target: string): void {
  vi.spyOn(gateFileSystem, "inspect").mockImplementation((candidate) => {
    const information = lstatSync(candidate, { bigint: true, throwIfNoEntry: false });
    return candidate === path && information !== undefined
      ? Object.assign(Object.create(information) as BigIntStats, {
          isFile: () => false,
          isSymbolicLink: () => true,
        })
      : information;
  });
  vi.spyOn(gateFileSystem, "readLink").mockImplementation((candidate) =>
    candidate === path ? Buffer.from(target) : readlinkSync(candidate, { encoding: "buffer" }),
  );
}

/** Requires a passing gate that records an untracked link as its target path and never its content. */
async function expectRecordedLink(
  fixture: Awaited<ReturnType<typeof prepareGate>>,
  path: string,
  target: string,
): Promise<GateResult["revision"]> {
  const receipt = await fixture.receipt();
  expect(receipt.verdict).toBe("pass");
  const copy = join(fixture.directory(), "untracked", path);
  expect(await readFile(copy, "utf8")).toBe(target);
  expect(
    JSON.parse(await readFile(join(fixture.directory(), "changed-files.json"), "utf8")).files,
  ).toContainEqual({ status: "??", path, isSymbolicLink: true, copy });
  expect(await readEvidenceText(fixture.directory())).not.toContain(secret);
  expect(fixture.prompts.join("\n")).not.toContain(secret);
  return receipt.revision;
}

/** Creates a synthetic file outside every fixture repository that holds the secret. */
async function createOutsideFile(name: string): Promise<string> {
  const outside = await mkdtemp(join(tmpdir(), "independum-run-gate-outside-"));
  directories.push(outside);
  const path = join(outside, name);
  await writeFile(path, `${secret}\n`);
  return path;
}

/** Requires a gate that stops before any role with this error and keeps the secret out of evidence. */
async function expectRefusal(
  fixture: Awaited<ReturnType<typeof prepareGate>>,
  message: string,
): Promise<string> {
  const output = fixture.arguments[fixture.arguments.indexOf("--output") + 1] ?? "";
  const evidence = (await readdir(output)).filter((name) => name.startsWith("gate-"));
  expect(evidence).toHaveLength(1);
  const directory = join(output, evidence[0] ?? "");
  const receipt = JSON.parse(await readFile(join(directory, "receipt.json"), "utf8"));
  expect(receipt.verdict).not.toBe("pass");
  expect(receipt.error).toContain(message);
  expect(fixture.prompts).toHaveLength(0);
  expect(await readEvidenceText(directory)).not.toContain(secret);
  return directory;
}

/** Requires a refusal that stops the gate before it writes any change evidence. */
async function expectRefusalBeforeChange(
  fixture: Awaited<ReturnType<typeof prepareGate>>,
  message: string,
): Promise<void> {
  const directory = await expectRefusal(fixture, message);
  await expect(access(join(directory, "change.diff"))).rejects.toThrow();
}

async function readEvidenceText(directory: string): Promise<string> {
  const texts: string[] = [];
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      texts.push(await readFile(join(entry.parentPath, entry.name), "utf8"));
    }
  }
  return texts.join("\n");
}

async function prepareChange(root: string): Promise<string> {
  const worktree = join(root, "worktree");
  await mkdir(join(worktree, "src"), { recursive: true });
  await mkdir(join(worktree, "qa"));
  // Fixture Git ignores user and system settings, so personal hooks, signing, and diff options
  // cannot change the result.
  vi.stubEnv("GIT_CONFIG_GLOBAL", join(root, "absent-git-config"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  // A pre-commit hook runs this test with Git variables that point at the outer repository and
  // override the working folder, so the fixture and the gate's own Git commands clear them.
  for (const name of [
    "GIT_DIR",
    "GIT_INDEX_FILE",
    "GIT_WORK_TREE",
    "GIT_PREFIX",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ]) {
    vi.stubEnv(name, undefined);
  }
  // Task context and scenarios lie in the worktree, as the gate requires.
  for (const [path, text] of Object.entries({
    ".gitignore": "ignored.log\n",
    "tracked.ts": "export const value = 1;\n",
    "AGENTS.md": "# Fixture\n",
    "qa/welcome.json": "{}\n",
    "qa/settings.json": "{}\n",
  })) {
    await writeFile(join(worktree, path), text);
  }
  for (const arguments_ of [
    ["init", "--quiet", "--initial-branch=main"],
    ["add", "--all"],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "--quiet",
      "--message=Fixture base.",
    ],
  ]) {
    execFileSync("git", arguments_, { cwd: worktree, stdio: "ignore" });
  }
  await writeFile(join(worktree, "tracked.ts"), "export const value = 2;\n");
  await writeFile(join(worktree, "src", "added.ts"), "export const added = true;\n");
  await writeFile(join(worktree, "ignored.log"), "Ignored output.\n");
  return worktree;
}
