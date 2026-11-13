export interface TestAvailability {
  file: string;
  name: string;
  status: "skipped" | "unavailable" | "failed";
  reason: string;
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
      seen.has(JSON.stringify([test.file, test.name]))
    ) {
      throw new Error(
        "Each unavailable or skipped test needs a unique name, file, status, and reason.",
      );
    }
    seen.add(JSON.stringify([test.file, test.name]));
  }
  return report.tests as TestAvailability[];
}
