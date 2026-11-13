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
  for (const report of [
    undefined,
    {},
    { completed: false, tests: [] },
    { completed: true },
    { completed: true, tests: [entry, entry] },
    ...["name", "file", "reason", "status"].map((key) => ({
      completed: true,
      tests: [{ ...entry, [key]: "" }],
    })),
  ]) {
    expect(() => readTestAvailability(report)).toThrow();
  }
});
