import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { TestModule } from "vitest/node";
import { readTestAvailability } from "./read-test-availability.ts";
import ReportTestAvailability from "./report-test-availability.ts";

test("availability reporter retains dynamic notes declaration reasons and collection failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "independum-test-report-"));
  const path = join(directory, "availability.json");
  vi.stubEnv("INDEPENDUM_TEST_REPORT", path);
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  try {
    const module = {
      moduleId: "native.test.ts",
      relativeModuleId: "native.test.ts",
      errors: () => [{ message: "The default shell is unavailable." }],
      children: {
        allTests: () => [
          {
            fullName: "native boundary",
            result: () => ({ state: "skipped", note: "Native containment is unavailable." }),
            meta: () => ({}),
          },
          {
            fullName: "browser journey",
            result: () => ({ state: "skipped" }),
            meta: () => ({ skipReason: "No browser is selected." }),
          },
          {
            fullName: "shell command",
            result: () => ({ state: "failed", errors: [{ message: "No shell." }] }),
            meta: () => ({}),
          },
        ],
      },
    } as unknown as TestModule;
    new ReportTestAvailability().onTestRunEnd([module]);
    expect(readTestAvailability(JSON.parse(await readFile(path, "utf8")))).toEqual([
      {
        file: "native.test.ts",
        name: "native.test.ts",
        status: "unavailable",
        reason: "The default shell is unavailable.",
      },
      {
        file: "native.test.ts",
        name: "native boundary",
        status: "skipped",
        reason: "Native containment is unavailable.",
      },
      {
        file: "native.test.ts",
        name: "browser journey",
        status: "skipped",
        reason: "No browser is selected.",
      },
      { file: "native.test.ts", name: "shell command", status: "failed", reason: "No shell." },
    ]);
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining("native boundary: Native containment is unavailable."),
    );
  } finally {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  }
});
