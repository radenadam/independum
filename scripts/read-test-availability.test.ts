import { expect, test } from "vitest";
import { readTestAvailability } from "./read-test-availability.ts";

test("test availability keeps each named capability reason and rejects incomplete reports", () => {
  const entry = {
    file: "native.test.ts",
    name: "host boundary",
    status: "skipped",
    reason: "Native containment is unavailable.",
  };
  expect(readTestAvailability({ completed: true, tests: [entry] })).toEqual([entry]);
  const covered = { ...entry, ciPlatforms: ["linux", "darwin"] };
  expect(readTestAvailability({ completed: true, tests: [covered] })).toEqual([covered]);
  for (const report of [
    undefined,
    {},
    { completed: false, tests: [] },
    { completed: true },
    { completed: true, tests: [entry, entry] },
    ...[[], ["unknown"], ["linux", "linux"], "linux"].map((ciPlatforms) => ({
      completed: true,
      tests: [{ ...entry, ciPlatforms }],
    })),
    { completed: true, tests: [{ ...covered, status: "failed" }] },
    ...["name", "file", "reason", "status"].map((key) => ({
      completed: true,
      tests: [{ ...entry, [key]: "" }],
    })),
  ]) {
    expect(() => readTestAvailability(report)).toThrow();
  }
});
