import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SessionManager, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { commandEnvironment } from "./command-environment.ts";
import { builtInSettings } from "./read-settings-change.ts";
import type { FileOperation } from "./run-file-operation.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";

const { project: folder } = createTestProject(createTestFolder("file-worker-startup"), true);
const worker = new URL("./run-file-operation.ts", import.meta.url);
test("file worker preserves fingerprints, diffs, and images with ordinary node module resolution", () => {
  const manager = SessionManager.inMemory(folder);
  function call(
    name: string,
    input: Record<string, unknown>,
  ): Awaited<ReturnType<ToolDefinition["execute"]>> {
    const operation: FileOperation = {
      name,
      id: name,
      input,
      folder,
      settings: builtInSettings,
      branch: manager.getBranch(),
      model: { input: ["text", "image"] },
    };
    const output = execFileSync(process.execPath, [fileURLToPath(worker)], {
      input: JSON.stringify(operation),
      encoding: "utf8",
      env: commandEnvironment("minimal", {}),
      timeout: 15_000,
    });
    const { result } = JSON.parse(output) as {
      result: Awaited<ReturnType<ToolDefinition["execute"]>>;
    };
    manager.appendMessage({
      role: "toolResult",
      toolCallId: name,
      toolName: name,
      content: result.content,
      details: JSON.parse(JSON.stringify(result.details ?? null)),
      isError: result.isError ?? false,
      timestamp: Date.now(),
    });
    return result;
  }
  const file = join(folder, "text.txt");
  writeFileSync(file, "first\nsecond\n");
  const physical = realpathSync.native(file);
  expect(call("Read", { path: file })).toMatchObject({
    content: [{ type: "text", text: "1\tfirst\n2\tsecond" }],
    details: { fingerprint: { file: physical } },
  });
  writeFileSync(file, "first\nchanged\n");
  // biome-ignore lint/style/useNamingConvention: Edit names its model-facing parameters.
  const edited = call("Edit", { path: file, old_string: "changed", new_string: "third" });
  expect(edited).toMatchObject({
    details: { added: 1, removed: 1, fingerprint: { file: physical } },
  });
  expect(edited.content[0]).toMatchObject({
    type: "text",
    text: expect.stringContaining("changed since this chat last saw it, at line 2"),
  });
  expect(call("Write", { path: file, content: "last\n" })).toMatchObject({
    details: { isNew: false, added: 1, removed: 2, fingerprint: { file: physical } },
  });
  expect(readFileSync(file, "utf8")).toBe("last\n");
  const image = join(folder, "image.png");
  writeFileSync(
    image,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    ),
  );
  expect(call("Read", { path: image })).toMatchObject({
    content: [{ type: "text" }, { type: "image", mimeType: "image/png" }],
    details: {
      kind: "image",
      width: 1,
      height: 1,
      fingerprint: { file: realpathSync.native(image) },
    },
  });
}, 30_000);
