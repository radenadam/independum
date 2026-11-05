import { expect, test } from "vitest";
import { findDuplicateRanges } from "./find-duplicate-ranges.ts";

test("repeated ranges fail regardless of numeric spelling or property order", () => {
  expect(
    findDuplicateRanges([
      { file: "server.ts", code: "const lineRange = { min: 10, max: 1_000_000 };" },
      { file: "fields.ts", code: "const lineRange = { max: 1000000, min: 10 };" },
    ]),
  ).toEqual(["fields.ts:1: Range duplicates server.ts:1. Import its definition instead."]);
});

test("importing a range or deriving another unit keeps one definition", () => {
  expect(
    findDuplicateRanges([
      { file: "ranges.ts", code: "export const range = { min: 1, max: 102_400 };" },
      {
        file: "server.ts",
        code: 'import { range } from "./ranges.ts"; const bytes = { min: range.min * 1024, max: range.max * 1024 };',
      },
      { file: "fields.ts", code: 'import { range } from "./ranges.ts";' },
    ]),
  ).toEqual([]);
});
