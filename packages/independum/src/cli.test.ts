import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const execute = promisify(execFile);

test.each([["prompt", "--help"], ["wait", "--help"], ["server", "--help"], ["--version"]])(
  "the cli entry stays quiet and offline for %j",
  async (...argumentsList) => {
    const result = await execute(
      process.execPath,
      [join(import.meta.dirname, "cli.ts"), ...argumentsList],
      { windowsHide: true },
    );
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(result.stdout).not.toContain("#token=");
  },
);
