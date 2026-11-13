export interface TestAvailability {
  file: string;
  name: string;
  status: "skipped" | "unavailable" | "failed";
  reason: string;
  ciPlatforms?: string[];
}

/** Formats one named availability result without treating CI coverage as a pass. */
export function formatTestAvailability(test: TestAvailability): string {
  const coverage =
    test.ciPlatforms === undefined ? "" : ` Covered by CI on ${test.ciPlatforms.join(", ")}.`;
  return `Test ${test.status}: ${test.file} > ${test.name}: ${test.reason}${coverage}`;
}

/** Requires named reasons for every recorded test that does not pass. */
export function readTestAvailability(value: unknown): TestAvailability[] {
  const report = value as { completed?: unknown; tests?: unknown } | null;
  if (
    report === null ||
    typeof report !== "object" ||
    report.completed !== true ||
    !Array.isArray(report.tests)
  ) {
    throw new Error("The test availability report is missing or incomplete.");
  }
  const seen = new Set<string>();
  for (const test of report.tests as TestAvailability[]) {
    if (
      test === null ||
      typeof test !== "object" ||
      ![test.file, test.name, test.reason].every(
        (text) => typeof text === "string" && text.trim() !== "",
      ) ||
      !["skipped", "unavailable", "failed"].includes(test.status) ||
      seen.has(JSON.stringify([test.file, test.name])) ||
      (test.ciPlatforms !== undefined &&
        (test.status !== "skipped" ||
          !Array.isArray(test.ciPlatforms) ||
          test.ciPlatforms.length === 0 ||
          new Set(test.ciPlatforms).size !== test.ciPlatforms.length ||
          test.ciPlatforms.some((platform) => !["linux", "darwin", "win32"].includes(platform))))
    ) {
      throw new Error(
        "Each unavailable or skipped test needs a unique name, file, status, and reason.",
      );
    }
    seen.add(JSON.stringify([test.file, test.name]));
  }
  return report.tests as TestAvailability[];
}
