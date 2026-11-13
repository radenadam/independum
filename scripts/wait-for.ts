import { TestRunner, vi } from "vitest";

/** Retries an assertion within the current test's remaining budget. */
export function waitFor<T>(condition: () => T | Promise<T>): Promise<T> {
  const test = TestRunner.getCurrentTest();
  const startedAt = test?.result?.startTime;
  if (test === undefined || startedAt === undefined) {
    throw new Error("Wait for a condition inside a running test.");
  }
  // Leave time for the assertion error to reach Vitest before its test timeout.
  const timeout = Math.max(1, test.timeout - (vi.getRealSystemTime() - startedAt) - 100);
  return vi.waitFor(condition, { timeout });
}
