import { readFileSync } from "node:fs";
import { findContextProblems } from "./find-context-problems.ts";
import { runCheck } from "./run-check.ts";

runCheck((files) =>
  findContextProblems(
    new Map(
      files
        .filter((file) => file.endsWith(".md"))
        .map((file) => [file, readFileSync(file, "utf8")]),
    ),
    files,
  ),
);
