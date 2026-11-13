import { join } from "node:path";
import { browserRegressionTests } from "./read-gate-browser-checks.ts";
import type { TestAvailability } from "./read-test-availability.ts";

/** Creates named regression results for gate orchestration fixtures. */
export function createTestBrowserReport(folder: string): {
  completed: boolean;
  tests: TestAvailability[];
  passedTests: { file: string; name: string }[];
} {
  return {
    completed: true,
    tests: [],
    passedTests: browserRegressionTests.map((test) => ({ ...test, file: join(folder, test.file) })),
  };
}
