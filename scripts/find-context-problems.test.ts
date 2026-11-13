import { expect, test } from "vitest";
import { findContextProblems } from "./find-context-problems.ts";

test("context checks reject broken anchors and unknown requirements", () => {
  const documents = context();
  documents.set("AGENTS.md", "# Entry\n\n[Work](docs/workflow.md#absent). CP-99\n");
  const problems = findContextProblems(documents, [...documents.keys()]);
  expect(problems).toContain("AGENTS.md: Anchor docs/workflow.md#absent is missing.");
  expect(problems).toContain("AGENTS.md: Unknown requirement CP-99.");
});

test("context checks reject unsupported completion and excess budgets", () => {
  const documents = context();
  documents.set(
    "docs/checkpoint.md",
    "# Checkpoint\n\n| CP-01 | 2026-11-10 | Observable | complete: exists | unverified: skipped |\n",
  );
  documents.set("AGENTS.md", `# Entry\n\n${"word ".repeat(50)}`);
  const problems = findContextProblems(documents, [...documents.keys()]);
  expect(problems.some((problem) => problem.includes("word budget"))).toBe(true);
  expect(problems).toContain(
    "docs/checkpoint.md: Complete implementation requires verified acceptance.",
  );
});

test("context checks allow valid ownership links and ledger fields", () => {
  const documents = context();
  expect(findContextProblems(documents, [...documents.keys()])).toEqual([]);
});

test("context checks detect duplicated requirements missing owners and misleading decision labels", () => {
  const documents = context();
  documents.delete("AGENTS.md");
  documents.set(
    "docs/checkpoint.md",
    `${documents.get("docs/checkpoint.md")}\n| CP-01 | 2026-11-10 | Repeated | missing: none | unverified: none |\n[decision 0053](decisions/0058-address-chats-by-id.md)\n`,
  );
  const problems = findContextProblems(documents, [...documents.keys()]);
  expect(problems).toContain("docs/checkpoint.md: Requirement ids must be unique.");
  expect(problems).toContain("docs/workflow.md: Owned context AGENTS.md is missing.");
  expect(problems).toContain(
    "docs/checkpoint.md: Decision label 0053 disagrees with its target 0058.",
  );
});

function context(): Map<string, string> {
  return new Map([
    ["AGENTS.md", "# Entry\n\n[Work](docs/workflow.md#workflow).\n"],
    ["CLAUDE.md", "@AGENTS.md\n"],
    [
      "docs/checkpoint.md",
      "# Checkpoint\n\n| CP-01 | 2026-11-10 | Observable | partial: exists | unverified: skipped |\n",
    ],
    [
      "docs/workflow.md",
      "# Workflow\n\n| `AGENTS.md` | Coordinator | 20 | Rewrite | Entry |\n| `CLAUDE.md` | Coordinator | 1 | Keep | Import |\n| `docs/*.md` | Coordinator | 100 | Keep | Context |\n",
    ],
  ]);
}
