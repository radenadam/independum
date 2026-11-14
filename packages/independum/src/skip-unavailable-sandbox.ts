import type { TestContext } from "vitest";
import { isSandboxSetupFailure } from "./create-sandbox.ts";

/** Skips native setup failures while preserving unexpected failures as test errors. */
export function skipUnavailableSandbox(context: TestContext, error: unknown): never {
  if (isSandboxSetupFailure(error)) {
    context.skip(`Sandbox setup fails before the native test: ${error.message}`);
  }
  throw error;
}
