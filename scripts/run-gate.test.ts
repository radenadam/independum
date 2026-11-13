import { ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestBrowserReport } from "./create-test-browser-report.ts";
import type { GateResult, GateTask } from "./gate-contract.ts";
import { browserRegressionTests } from "./read-gate-browser-checks.ts";
import { readRevision } from "./read-revision.ts";
import type { TestAvailability } from "./read-test-availability.ts";
import { runGate } from "./run-gate.ts";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));

vi.mock("node:fs", async (original) => {
  const filesystem = await original<typeof import("node:fs")>();
  return {
    ...filesystem,
    writeFileSync: vi.fn((...arguments_: Parameters<typeof filesystem.writeFileSync>) => {
      if (!/[\\/]independum-gate[\\/]latest\.json$/.test(String(arguments_[0]))) {
        filesystem.writeFileSync(...arguments_);
      }
    }),
  };
});

const folder = resolve(import.meta.dirname, "..");
const directories: string[] = [];

beforeEach(() => {
  vi.mocked(spawn).mockClear();
});

afterEach(async () => {
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
  expect(receipt.testAvailability).toEqual([
    {
      file: "native.test.ts",
      name: "native boundary",
      status: "skipped",
      reason: "Native containment is unavailable.",
    },
  ]);
  expect(fixture.prompts.at(-1)).toContain("revision.json");
  expect(fixture.prompts[0]).toContain("browser-checks.json");
  expect(fixture.prompts[0]).toContain("browser-regressions.json");
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

test.each(["codex", "claude"])(
  "runner pins %s identity and overrides role guesses",
  async (engine) => {
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
  },
);

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

test("missing test reports and unavailable tests block passing agent verdicts", async () => {
  for (const report of [
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
  ]) {
    const fixture = await prepareGate("pass", "codex", {
      testReport: report,
      hasTestReportOverride: true,
    });
    await runGate(fixture.arguments);
    const receipt = await fixture.receipt();
    expect(receipt.verdict).toBe("fail");
    expect(receipt.testAvailability).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "unavailable", reason: expect.any(String) }),
      ]),
    );
  }
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
  } = {},
): Promise<{
  arguments: string[];
  task: GateTask;
  scenarios: string[];
  prompts: string[];
  directory: () => string;
  receipt: () => Promise<{
    verdict: string;
    roles: GateResult[];
    testAvailability: TestAvailability[];
  }>;
}> {
  const root = await mkdtemp(join(tmpdir(), "independum-run-gate-"));
  directories.push(root);
  const task: GateTask = {
    outcome: "Exercise coordinator gate orchestration.",
    base: "HEAD",
    requirements: ["CP-25"],
    acceptance: [{ id: "A1", behavior: "Gate evidence is complete." }],
    preservedBehavior: "Fail closed.",
    exclusions: "Product changes.",
    reading: [join(folder, "AGENTS.md")],
    writableFiles: [],
    sharedFiles: [],
    capabilities: ["Coordinator browser and agent execution."],
    verificationOwner: "Coordinator",
    questionRound: "No new decision is needed.",
    isVisible: true,
    scenarios: [join(folder, "qa", "welcome.json"), join(folder, "qa", "settings.json")],
    learning: [],
  };
  const taskPath = join(root, "task.json");
  await writeFile(taskPath, JSON.stringify(task));
  vi.stubEnv("npm_execpath", "fixture-pnpm.exe");
  const scenarios: string[] = [];
  const prompts: string[] = [];
  const captures: string[] = [];
  let directory = "";
  let revision: GateResult["revision"] = readRevision(folder, task.base);
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
              tests: [
                {
                  file: "native.test.ts",
                  name: "native boundary",
                  status: "skipped",
                  reason: "Native containment is unavailable.",
                },
              ],
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
          const output = await mkdtemp(join(root, "browser-"));
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
            await writeFile(path, text);
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
    task,
    scenarios,
    prompts,
    directory: () => directory,
    receipt: async () => JSON.parse(await readFile(join(directory, "receipt.json"), "utf8")),
  };
}
