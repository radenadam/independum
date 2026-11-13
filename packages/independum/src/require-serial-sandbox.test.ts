import { expect, test } from "vitest";
import { captureSandbox, launchSandbox } from "./create-sandbox.ts";

test("parallel test files refuse native launches through the production adapter", async () => {
  const request = { command: "never started" };
  const reason = "Native sandbox launches require the native-sandbox Vitest project.";
  await expect(launchSandbox(request)).rejects.toThrow(reason);
  await expect(captureSandbox(request)).rejects.toThrow(reason);
});
