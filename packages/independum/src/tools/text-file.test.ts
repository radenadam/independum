import { statSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { createModelTexts } from "../model-texts.ts";
import { findFile } from "./text-file.ts";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, statSync: vi.fn(actual.statSync) };
});

test("metadata denial reports its operating system error instead of claiming the file is missing", () => {
  vi.mocked(statSync).mockImplementationOnce(() => {
    throw Object.assign(new Error("Access is denied."), { code: "EACCES" });
  });
  expect(() =>
    findFile(
      "file.txt",
      process.cwd(),
      createModelTexts(() => ({})),
    ),
  ).toThrow("Could not inspect file.txt.\nAccess is denied.");
});
