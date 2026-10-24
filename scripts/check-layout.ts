import { runCheck } from "./run-check.ts";

// Every top-level entry needs a reason to exist, so a new one fails until it is listed here.
const rootEntries = new Set([
  ".claude",
  ".editorconfig",
  ".gitattributes",
  ".github",
  ".gitignore",
  ".jscpd.json",
  ".markdownlint-cli2.jsonc",
  "AGENTS.md",
  "CLAUDE.md",
  "LICENSE",
  "README.md",
  "biome.json",
  "docs",
  "knip.json",
  "package.json",
  "packages",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "scripts",
  "tsconfig.base.json",
  "tsconfig.json",
]);

// The tools and people that read these files expect these exact names.
const fixedNames = new Set(["AGENTS.md", "CLAUDE.md", "LICENSE", "README.md"]);

const allowedExtensions = new Set([
  "css",
  "html",
  "json",
  "jsonc",
  "md",
  "svg",
  "ts",
  "tsx",
  "yaml",
  "yml",
]);

// These names say nothing about what a file or folder holds.
const vagueNames = new Set([
  "common",
  "helper",
  "helpers",
  "lib",
  "misc",
  "shared",
  "temp",
  "tmp",
  "util",
  "utils",
]);

// GitHub and Claude Code require these paths, so they may hold a single entry.
const singleEntryFolders = new Set([".claude", ".github", ".github/workflows"]);

const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

runCheck((files) => {
  const problems = new Set<string>();
  const folderEntries = new Map<string, Set<string>>();

  for (const file of files) {
    const segments = file.split("/");
    const [rootEntry] = segments;
    if (rootEntry !== undefined && !rootEntries.has(rootEntry)) {
      problems.add(`${rootEntry}: Unexpected top-level entry. List it in scripts/check-layout.ts.`);
    }

    for (const [index, segment] of segments.entries()) {
      const path = segments.slice(0, index + 1).join("/");
      const parent = segments.slice(0, index).join("/");
      folderEntries.set(parent, (folderEntries.get(parent) ?? new Set()).add(segment));
      for (const problem of findNameProblems(segment, index === segments.length - 1)) {
        problems.add(`${path}: ${problem}`);
      }
    }
  }

  for (const [folder, entries] of folderEntries) {
    if (folder !== "" && entries.size < 2 && !singleEntryFolders.has(folder)) {
      problems.add(`${folder}: Folder holds a single entry. Move the entry up a level.`);
    }
  }

  return [...problems];
});

function findNameProblems(name: string, isFile: boolean): string[] {
  if (fixedNames.has(name)) {
    return [];
  }

  const parts = name.replace(/^\./, "").split(".");
  const problems: string[] = [];
  if (!parts.every((part) => kebabCase.test(part))) {
    problems.push("Name is not kebab-case.");
  }
  if (parts[0] !== undefined && vagueNames.has(parts[0])) {
    problems.push(`Name "${parts[0]}" is vague. Name it after what it holds.`);
  }

  const extension = parts.length > 1 ? parts.at(-1) : undefined;
  const isDotfile = name.startsWith(".") && extension === undefined;
  if (isFile && !isDotfile && (extension === undefined || !allowedExtensions.has(extension))) {
    problems.push("File type is not allowed. Throwaway files belong outside the repository.");
  }
  return problems;
}
