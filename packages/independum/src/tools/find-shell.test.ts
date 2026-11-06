import { execFileSync } from "node:child_process";
import { expect, test, vi } from "vitest";
import { findShell } from "./find-shell.ts";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn(() => "GNU bash, version 5.2.0") }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn(() => true) };
});

test("project shell discovery never executes a host version probe", () => {
  expect(findShell("bash", true)).toMatchObject({ kind: "bash", hasVersion: false });
  expect(execFileSync).not.toHaveBeenCalled();
  expect(findShell("bash", false)?.name).toContain("5.2.0");
  expect(execFileSync).toHaveBeenCalledOnce();
});
