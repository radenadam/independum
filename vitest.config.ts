import { configDefaults, defineConfig } from "vitest/config";

const nativeSandboxTests = [
  "packages/independum/src/create-sandbox.test.ts",
  "packages/independum/src/script-hook-sandbox.test.ts",
  "packages/independum/src/run-file-operation.test.ts",
  "packages/independum/src/sandbox-runtime.test.ts",
];

const serverProcessTests = [
  "packages/component-protocol/src/transport-capture-model.test.ts",
  "packages/component-protocol/src/invocation-model.test.ts",
  "packages/component-protocol/src/transport-conformance.test.ts",
  "packages/independum/src/qa/start-preview.test.ts",
  "scripts/run-gate.test.ts",
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "parallel",
          sequence: { groupOrder: 0 },
          exclude: [...configDefaults.exclude, ...nativeSandboxTests, ...serverProcessTests],
          setupFiles: ["packages/independum/src/require-serial-sandbox.ts"],
        },
      },
      {
        test: {
          name: "native-sandbox",
          // Native containers run after the other tests, because running both at once starves
          // timing checks of the parallel tests.
          sequence: { groupOrder: 1 },
          include: nativeSandboxTests,
          fileParallelism: false,
        },
      },
      {
        test: {
          name: "server-processes",
          // These files start whole server and gate processes, which take a few seconds alone but
          // pass the test limit while every parallel worker is busy.
          sequence: { groupOrder: 2 },
          include: serverProcessTests,
          fileParallelism: false,
        },
      },
    ],
  },
});
