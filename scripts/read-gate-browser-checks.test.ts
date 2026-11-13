import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createTestBrowserReport } from "./create-test-browser-report.ts";
import {
  browserRegressionTests,
  type GateBrowserCheck,
  readGateBrowserChecks,
  readGateBrowserRegressions,
} from "./read-gate-browser-checks.ts";

const revision = {
  head: "head",
  base: "base",
  fingerprint: "source",
  contextFingerprint: "context",
};

test("real-browser receipts reject missing stale skipped and unnamed results", async () => {
  await withBrowserEvidence(async (scenario) => {
    const check = {
      revision,
      browser: "msedge",
      command: ["exec", "vitest", "run", ...browserRegressionTests.map((test) => test.file)],
      log: scenario.log,
      report: join(scenario.directory, "tests.json"),
    };
    const report = createTestBrowserReport(scenario.directory);
    await writeFile(check.report, JSON.stringify(report));
    expect(() => readGateBrowserRegressions(check, revision)).not.toThrow();
    for (const value of [
      undefined,
      { ...check, revision: { ...revision, fingerprint: "stale" } },
      { ...check, command: [] },
    ]) {
      expect(() => readGateBrowserRegressions(value, revision)).toThrow();
    }
    for (const value of [
      {},
      { ...report, completed: false },
      { ...report, tests: [{ status: "skipped" }] },
      { ...report, passedTests: [] },
      { ...report, passedTests: [report.passedTests[0], report.passedTests[0]] },
    ]) {
      await writeFile(check.report, JSON.stringify(value));
      expect(() => readGateBrowserRegressions(check, revision)).toThrow();
    }
  });
});

test("browser receipts require every scenario with its own complete evidence", async () => {
  await withBrowserEvidence(async (check) => {
    const task = { scenarios: [check.scenario] };
    expect(() => readGateBrowserChecks([check], task, revision)).not.toThrow();
    for (const checks of [
      undefined,
      [],
      [{ ...check, verdict: "incomplete" }],
      [{ ...check, scenario: "another" }],
    ]) {
      expect(() => readGateBrowserChecks(checks, task, revision)).toThrow();
    }
    expect(() =>
      readGateBrowserChecks([check], { scenarios: [check.scenario, "another"] }, revision),
    ).toThrow();
    expect(() =>
      readGateBrowserChecks([check, check], { scenarios: [check.scenario, "another"] }, revision),
    ).toThrow();
  });
});

test("browser receipts reject stale revisions diagnostics failures and missing artifacts", async () => {
  await withBrowserEvidence(async (check) => {
    const task = { scenarios: [check.scenario] };
    for (const key of Object.keys(revision)) {
      expect(() => readGateBrowserChecks([check], task, { ...revision, [key]: "stale" })).toThrow(
        "another revision",
      );
    }
    for (const [name, value] of [
      ["browser.jsonl", '{"message":"Browser warning."}\n'],
      ["values.jsonl", ""],
      ["observed.png", ""],
      ["failure.txt", "Scenario fails."],
    ] as const) {
      await writeFile(join(check.directory, name), value);
      expect(() => readGateBrowserChecks([check], task, revision)).toThrow();
      await writeFile(join(check.directory, name), name === "browser.jsonl" ? "" : "observed");
    }
  });
});

async function withBrowserEvidence(run: (check: GateBrowserCheck) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "independum-browser-check-"));
  try {
    const scenario = join(directory, "input.json");
    const log = join(directory, "scenario.log");
    for (const [name, value] of Object.entries({
      "revision.json": JSON.stringify({ ...revision, scenario, driver: "playwright-core" }),
      "scenario.json": "{}",
      "values.jsonl": '{"step":1,"value":{"observed":true}}\n',
      "browser.jsonl": "",
      "observed.png": "fixture screenshot",
      "scenario.log": `QA output: ${directory}\n`,
    })) {
      await writeFile(join(directory, name), value);
    }
    await run({ scenario, verdict: "pass", directory, log });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
