import { writeFileSync } from "node:fs";
import type { Reporter, TestModule } from "vitest/node";
import type { TestAvailability } from "./read-test-availability.ts";

/** Reports every skipped, failed, or uncollected test with its reason. */
// biome-ignore lint/style/noDefaultExport: Vitest loads custom reporter constructors from the default export.
export default class ReportTestAvailability implements Reporter {
  onTestRunEnd(modules: readonly TestModule[]): void {
    const tests: TestAvailability[] = [];
    for (const module of modules) {
      const errors = module.errors();
      if (errors.length > 0) {
        tests.push({
          file: module.moduleId,
          name: module.relativeModuleId,
          status: "unavailable",
          reason: errors.map((error) => error.message ?? String(error)).join("\n"),
        });
      }
      for (const test of module.children.allTests()) {
        const result = test.result();
        if (result.state === "skipped") {
          const reason = result.note ?? (test.meta() as { skipReason?: string }).skipReason;
          tests.push({
            file: module.moduleId,
            name: test.fullName,
            status: "skipped",
            reason: reason ?? "Vitest supplies no skip reason.",
          });
          if (!reason) {
            process.exitCode = 1;
          }
        } else if (result.state === "failed" || result.state === "pending") {
          tests.push({
            file: module.moduleId,
            name: test.fullName,
            status: result.state === "failed" ? "failed" : "unavailable",
            reason:
              result.errors?.map((error) => error.message).join("\n") ||
              "The test does not finish.",
          });
        }
      }
    }
    for (const test of tests) {
      process.stdout.write(`Test ${test.status}: ${test.file} > ${test.name}: ${test.reason}\n`);
    }
    const path = process.env.INDEPENDUM_TEST_REPORT;
    if (path !== undefined) {
      writeFileSync(path, JSON.stringify({ completed: true, tests }, null, 2));
    }
  }
}
