import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { fixedPartsOf, piTexts, summarizePiTexts } from "./pi-texts.ts";

// The packages of Pi only offer imports, so they are found through `node_modules`. pnpm puts the
// agent core of Pi beside the coding agent that depends on it.
const scope = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  "@earendil-works",
);
const codingAgent = realpathSync(join(scope, "pi-coding-agent"));
const packages = [
  codingAgent,
  realpathSync(join(scope, "pi-ai")),
  join(dirname(codingAgent), "pi-agent-core"),
];

// The bundle folder holds the command line app of Pi, which Independum does not run.
function codeOf(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(entry.parentPath, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "bundle" ? [] : codeOf(path);
    }
    return entry.name.endsWith(".js") ? [readFileSync(path, "utf8")] : [];
  });
}

const code = packages.flatMap((folder) => codeOf(join(folder, "dist"))).join("\n");

test("every text of Pi in the list is still in the code of the installed Pi", () => {
  for (const text of piTexts) {
    const missing = fixedPartsOf(text.text).filter(
      (part) => part.length >= 6 && !code.includes(part),
    );
    expect({ id: text.id, missing }).toEqual({ id: text.id, missing: [] });
  }
});

test("a text of Pi is marked when the last request holds it", () => {
  const request = {
    messages: [
      { role: "tool", content: "Tool Read not found" },
      { role: "tool", content: "Tool output\nThe file was not found" },
    ],
  };
  const marked = summarizePiTexts(request).filter((text) => text.isInLastRequest);
  expect(marked.map((text) => text.id)).toEqual(["toolNotFound"]);
  expect(summarizePiTexts(null).some((text) => text.isInLastRequest)).toBe(false);
});
