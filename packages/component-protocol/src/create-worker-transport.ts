import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { TestContext } from "vitest";
import { registerTestCleanup } from "./register-test-cleanup.ts";
import { createStreamTransport, type ProtocolTransport } from "./transports.ts";

/** Owns a real protocol fixture worker through test cancellation and teardown. */
export function createWorkerTransport(
  context: TestContext,
  entry: URL,
  workerArguments: string[] = [],
): ProtocolTransport {
  context.signal.throwIfAborted();
  const worker = spawn(process.execPath, [fileURLToPath(entry), ...workerArguments], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  registerTestCleanup(context, () => {
    worker.kill();
  });
  return createStreamTransport({
    input: worker.stdout,
    output: worker.stdin,
    diagnostics: worker.stderr,
    worker,
  });
}
