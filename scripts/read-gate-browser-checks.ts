import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { GateTask } from "./gate-contract.ts";
import { inspectExactFile, inspectLinkFreePath, readExactFile } from "./read-exact-file.ts";
import type { Revision } from "./read-revision.ts";

export interface GateBrowserCheck {
  scenario: string;
  verdict: "pass" | "fail" | "incomplete";
  directory: string;
  log: string;
  error?: string;
}

export const browserRegressionTests: { file: string; name: string }[] = [
  {
    file: "packages/independum/src/qa/connect-browser.test.ts",
    name: "real playwright diagnostics each reject an otherwise successful scenario",
  },
  {
    file: "packages/independum/src/qa/connect-browser.test.ts",
    name: "a restart step keeps unreachable server failures apart and still rejects other failures",
  },
  {
    file: "packages/independum/src/qa/check-rendered-qr.test.ts",
    name: "rendered qr checks reject blank captures despite a decoded source and survive theme changes",
  },
];

export interface GateBrowserRegressions {
  revision: Revision;
  browser: string;
  command: string[];
  log: string;
  report: string;
}

/** Requires named passing real-browser regressions bound to the reviewed revision. */
export function readGateBrowserRegressions(value: unknown, revision: Revision): void {
  const check = value as GateBrowserRegressions | undefined;
  if (
    !check?.revision ||
    Object.entries(revision).some(
      ([key, expected]) => check.revision[key as keyof Revision] !== expected,
    ) ||
    typeof check.browser !== "string" ||
    check.browser.trim() === "" ||
    !Array.isArray(check.command) ||
    !check.command.includes("vitest") ||
    browserRegressionTests.some((test) => !check.command.includes(test.file)) ||
    [check.log, check.report].some(
      (path) =>
        typeof path !== "string" ||
        !isAbsolute(path) ||
        !existsSync(path) ||
        statSync(path).size === 0,
    )
  ) {
    throw new Error("Real-browser regressions need commands, logs, and the reviewed revision.");
  }
  const report = JSON.parse(readFileSync(check.report, "utf8")) as {
    completed?: boolean;
    tests?: unknown[];
    passedTests?: { file: string; name: string }[];
  };
  if (
    report.completed !== true ||
    !Array.isArray(report.tests) ||
    report.tests.length !== 0 ||
    !Array.isArray(report.passedTests) ||
    report.passedTests.length !== browserRegressionTests.length ||
    browserRegressionTests.some(
      (expected) =>
        !report.passedTests?.some(
          (test) =>
            typeof test.file === "string" &&
            test.file.replaceAll("\\", "/").endsWith(`/${expected.file}`) &&
            test.name === expected.name,
        ),
    )
  ) {
    throw new Error("Both real-browser regressions must execute and pass by name.");
  }
}

/** Requires complete current Playwright evidence for every declared scenario. */
export function readGateBrowserChecks(
  value: unknown,
  task: Pick<GateTask, "scenarios">,
  revision: Revision,
): void {
  if (!Array.isArray(value) || value.length !== task.scenarios.length) {
    throw new Error("Every task scenario needs coordinator browser evidence.");
  }
  const scenarios = new Set(task.scenarios);
  for (const check of value as GateBrowserCheck[]) {
    if (
      check === null ||
      typeof check !== "object" ||
      !scenarios.delete(check.scenario) ||
      check.verdict !== "pass" ||
      typeof check.directory !== "string" ||
      !isAbsolute(check.directory) ||
      typeof check.log !== "string" ||
      !isAbsolute(check.log) ||
      !existsSync(check.log) ||
      statSync(check.log).size === 0
    ) {
      throw new Error("Every task scenario must pass with its own browser output and log.");
    }
    const names = readScenarioFiles(check.directory);
    const capture = JSON.parse(readScenarioFile(check.directory, "revision.json")) as Revision & {
      scenario: string;
      driver: string;
    };
    if (
      capture.scenario !== check.scenario ||
      capture.driver !== "playwright-core" ||
      Object.entries(revision).some(
        ([key, expected]) => capture[key as keyof Revision] !== expected,
      )
    ) {
      throw new Error("Scenario browser evidence belongs to another revision or driver.");
    }
    const screenshots = names.filter((name) => name.endsWith(".png"));
    if (
      existsSync(join(check.directory, "failure.txt")) ||
      readScenarioFile(check.directory, "browser.jsonl").trim() !== "" ||
      screenshots.length === 0 ||
      ["values.jsonl", "scenario.json", ...screenshots].some(
        (name) => statSync(join(check.directory, name)).size === 0,
      )
    ) {
      throw new Error("Scenario QA needs screenshots, values, and clean browser diagnostics.");
    }
  }
}

// The qa command writes each scenario output folder into the system temporary folder, so every
// component below that folder must be a real folder or file.
/** Lists a scenario output folder after requiring no link on its path and a regular file with one link per entry. */
export function readScenarioFiles(directory: string): string[] {
  if (!inspectLinkFreePath(tmpdir(), directory)?.isDirectory()) {
    throw new Error(`The gate refuses ${JSON.stringify(directory)}, because it is not a folder.`);
  }
  const names = readdirSync(directory);
  for (const name of names) {
    inspectExactFile(tmpdir(), join(directory, name));
  }
  return names;
}

function readScenarioFile(directory: string, name: string): string {
  const path = join(directory, name);
  return readExactFile(path, inspectExactFile(tmpdir(), path)).toString("utf8");
}
