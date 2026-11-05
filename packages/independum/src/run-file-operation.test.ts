import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SessionManager, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { parseSync, Visitor } from "oxc-parser";
import { expect, test } from "vitest";
import { commandEnvironment } from "./command-environment.ts";
import { builtInSettings } from "./read-settings-change.ts";
import type { FileOperation } from "./run-file-operation.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const folder = createTestFolder("file-worker-startup");
const worker = new URL("./run-file-operation.ts", import.meta.url);
const resolver = new URL("./file-worker-resolver.ts", import.meta.url);
const deniedRealpath = `
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const native = fs.realpathSync.native;
fs.realpathSync = Object.assign(() => {
  throw new Error("JavaScript realpath cannot inspect the drive root.");
}, { native });
syncBuiltinESMExports();
`;

function packageImports(entry: URL): string[] {
  const packages = new Set<string>();
  const visited = new Set<string>();
  function visit(file: URL): void {
    if (visited.has(file.href)) {
      return;
    }
    visited.add(file.href);
    function dependency(specifier: string): void {
      if (specifier.startsWith(".")) {
        visit(new URL(specifier, file));
      } else if (!specifier.startsWith("node:")) {
        packages.add(specifier);
      }
    }
    const source = parseSync(fileURLToPath(file), readFileSync(file, "utf8"));
    expect(source.errors).toEqual([]);
    // biome-ignore-start lint/style/useNamingConvention: Oxc names its syntax visitors.
    new Visitor({
      ImportDeclaration(node) {
        if (
          node.importKind !== "type" &&
          (node.specifiers.length === 0 ||
            node.specifiers.some(
              (specifier) =>
                specifier.type !== "ImportSpecifier" || specifier.importKind !== "type",
            ))
        ) {
          dependency(node.source.value);
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null && node.exportKind !== "type") {
          if (
            node.specifiers.length === 0 ||
            node.specifiers.some((item) => item.exportKind !== "type")
          ) {
            dependency(node.source.value);
          }
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== "type") {
          dependency(node.source.value);
        }
      },
      ImportExpression(node) {
        expect(node.source.type).toBe("Literal");
        if (node.source.type === "Literal" && typeof node.source.value === "string") {
          dependency(node.source.value);
        }
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          const argument = node.arguments[0];
          expect(argument?.type).toBe("Literal");
          if (argument?.type === "Literal" && typeof argument.value === "string") {
            dependency(argument.value);
          }
        }
      },
    }).visit(source.program);
    // biome-ignore-end lint/style/useNamingConvention: Oxc names its syntax visitors.
  }
  visit(entry);
  return [...packages].sort();
}

test("file worker bootstrap has no package value imports and its operation graph stays explicit", () => {
  expect(packageImports(resolver)).toEqual([]);
  expect(packageImports(worker)).toEqual([
    "@earendil-works/pi-ai",
    "@earendil-works/pi-coding-agent",
    "diff",
  ]);
});

test("file worker preserves fingerprints, diffs, and images without javascript realpath", () => {
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
    const output = execFileSync(
      process.execPath,
      [
        "--preserve-symlinks",
        "--preserve-symlinks-main",
        "--import",
        `data:text/javascript,${encodeURIComponent(deniedRealpath)}`,
        "--import",
        resolver.href,
        fileURLToPath(worker),
      ],
      {
        input: JSON.stringify(operation),
        encoding: "utf8",
        env: commandEnvironment("minimal", {}),
        timeout: 15_000,
      },
    );
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
  expect(call("Read", { path: file })).toMatchObject({
    content: [{ type: "text", text: "1\tfirst\n2\tsecond" }],
    details: { fingerprint: { file } },
  });
  writeFileSync(file, "first\nchanged\n");
  // biome-ignore lint/style/useNamingConvention: Edit names its model-facing parameters.
  const edited = call("Edit", { path: file, old_string: "changed", new_string: "third" });
  expect(edited).toMatchObject({ details: { added: 1, removed: 1, fingerprint: { file } } });
  expect(edited.content[0]).toMatchObject({
    type: "text",
    text: expect.stringContaining("changed since this chat last saw it, at line 2"),
  });
  expect(call("Write", { path: file, content: "last\n" })).toMatchObject({
    details: { isNew: false, added: 1, removed: 2, fingerprint: { file } },
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
    details: { kind: "image", width: 1, height: 1, fingerprint: { file: image } },
  });
}, 30_000);
