import { vi } from "vitest";

vi.mock("@microsoft/mxc-sdk/v1", async (importOriginal) => {
  const sandbox = await importOriginal<typeof import("@microsoft/mxc-sdk/v1")>();

  function refuseNativeSandbox(): never {
    throw new Error(
      "Native sandbox launches require the native-sandbox Vitest project. Add this test file to its include list in vitest.config.ts.",
    );
  }

  return {
    ...sandbox,
    spawn: refuseNativeSandbox,
    run: refuseNativeSandbox,
    spawnWithPty: refuseNativeSandbox,
    provisionContainer: refuseNativeSandbox,
    startContainer: refuseNativeSandbox,
    spawnInContainer: refuseNativeSandbox,
    spawnInContainerWithPty: refuseNativeSandbox,
    runInContainer: refuseNativeSandbox,
    stopContainer: refuseNativeSandbox,
    deprovisionContainer: refuseNativeSandbox,
  };
});
