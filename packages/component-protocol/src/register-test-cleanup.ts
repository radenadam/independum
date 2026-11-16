import type { TestContext } from "vitest";

/** Binds fixture resources to cancellation and teardown even when the body times out. */
export function registerTestCleanup(context: TestContext, cleanup: () => void): void {
  if (context.signal.aborted) {
    cleanup();
  } else {
    context.signal.addEventListener("abort", cleanup, { once: true });
  }
  context.onTestFinished(() => {
    cleanup();
    context.signal.removeEventListener("abort", cleanup);
  });
}
