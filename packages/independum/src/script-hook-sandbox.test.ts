import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MxcError } from "@microsoft/mxc-sdk/v1";
import { expect, test } from "vitest";
import { createHookTest } from "./create-hook-test.ts";
import { executeScriptHook } from "./execute-script-hook.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const parent = createTestFolder("script-hook-native");

test("native script hooks read outside the project while protecting configuration and state", async (testContext) => {
  const { hook, input, context, project, options, snapshots, script, runtime } =
    createHookTest(parent);
  if (runtime.unavailable !== null) {
    testContext.skip(runtime.unavailable);
  }
  const sentinel = join(project, ".independum", "sentinel.txt");
  const outside = join(project, "..", "outside.txt");
  const state = join(options.directory, "sentinel.txt");
  const created = [
    join(project, ".independum", "created.txt"),
    join(project, "..", "created.txt"),
    join(options.directory, "created.txt"),
  ];
  writeFileSync(sentinel, "protected");
  writeFileSync(outside, "outside");
  writeFileSync(state, "private state");
  writeFileSync(
    script,
    `import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
let input = "";
for await (const chunk of process.stdin) { input += chunk; }
const data = JSON.parse(input);
const outside = readFileSync(${JSON.stringify(outside)}, "utf8");
let state = null;
try { state = readFileSync(${JSON.stringify(state)}, "utf8"); } catch {}
for (const path of ${JSON.stringify([sentinel, outside, state, ...created])}) {
  try { writeFileSync(path, "changed"); } catch {}
}
writeFileSync(join(data.projectFolder, "hook-ran.json"), JSON.stringify({ input: data, outside, state }));
process.stdout.write(JSON.stringify({ apiVersion: 1, action: "continue" }));
`,
  );
  let result: Awaited<ReturnType<typeof executeScriptHook>>;
  try {
    result = await executeScriptHook(
      hook,
      input,
      new AbortController().signal,
      context,
      project,
      snapshots,
      options,
    );
  } catch (error) {
    if (
      error instanceof MxcError &&
      ["backend_error", "backend_unavailable", "unsupported_containment"].includes(error.code)
    ) {
      testContext.skip(error.message);
    }
    throw error;
  }
  expect(readFileSync(sentinel, "utf8")).toBe("protected");
  expect(readFileSync(outside, "utf8")).toBe("outside");
  expect(readFileSync(state, "utf8")).toBe("private state");
  for (const path of created) {
    expect(existsSync(path)).toBe(false);
  }
  expect(existsSync(join(project, "hook-ran.json"))).toBe(true);
  expect(JSON.parse(readFileSync(join(project, "hook-ran.json"), "utf8"))).toEqual({
    input,
    outside: "outside",
    state: null,
  });
  expect(result.failure).toBeUndefined();
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.output)).toEqual({ apiVersion: 1, action: "continue" });
});
