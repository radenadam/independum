import { setTimeout } from "node:timers/promises";
import { expect, test } from "vitest";
import { waitFor } from "./wait-for.ts";

test("a condition can arrive after the default wait limit", async () => {
  const startedAt = performance.now();
  await waitFor(() => expect(performance.now() - startedAt).toBeGreaterThan(1100));
});

test("waits share the remaining test budget and retain the failed assertion", {
  timeout: 2500,
}, async () => {
  await setTimeout(1100);
  await waitFor(() => expect(true).toBe(true));
  const failure = await waitFor(() => expect("handingOff").toBe("delivered")).catch(
    (error: unknown) => error,
  );
  expect(failure).toMatchObject({
    name: "AssertionError",
    actual: "handingOff",
    expected: "delivered",
  });
});
