import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { GateTask } from "./gate-contract.ts";
import type { Revision } from "./read-revision.ts";

export interface GateBrowserCheck {
  scenario: string;
  verdict: "pass" | "fail" | "incomplete";
  directory: string;
  log: string;
  error?: string;
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
    const capture = JSON.parse(
      readFileSync(join(check.directory, "revision.json"), "utf8"),
    ) as Revision & { scenario: string; driver: string };
    if (
      capture.scenario !== check.scenario ||
      capture.driver !== "playwright-core" ||
      Object.entries(revision).some(
        ([key, expected]) => capture[key as keyof Revision] !== expected,
      )
    ) {
      throw new Error("Scenario browser evidence belongs to another revision or driver.");
    }
    const screenshots = readdirSync(check.directory).filter((name) => name.endsWith(".png"));
    if (
      existsSync(join(check.directory, "failure.txt")) ||
      readFileSync(join(check.directory, "browser.jsonl"), "utf8").trim() !== "" ||
      screenshots.length === 0 ||
      ["values.jsonl", "scenario.json", ...screenshots].some(
        (name) => statSync(join(check.directory, name)).size === 0,
      )
    ) {
      throw new Error("Scenario QA needs screenshots, values, and clean browser diagnostics.");
    }
  }
}
