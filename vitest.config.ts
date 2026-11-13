import { configDefaults, defineConfig } from "vitest/config";

const nativeSandboxTests = [
  "packages/independum/src/create-sandbox.test.ts",
  "packages/independum/src/script-hook-sandbox.test.ts",
  "packages/independum/src/run-file-operation.test.ts",
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "parallel",
          sequence: { groupOrder: 0 },
          exclude: [...configDefaults.exclude, ...nativeSandboxTests],
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
    ],
  },
});
