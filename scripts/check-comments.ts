import { readFileSync } from "node:fs";
import { type Comment, parseSync } from "oxc-parser";
import { findDocCommentProblems, findProseProblems } from "./comment-problems.ts";
import { runCheck } from "./run-check.ts";

const sourceFile = /\.tsx?$/;
const directive = /^ (?:biome-ignore(?:-start|-end)?|@ts-expect-error) \S/;

runCheck((files) => files.filter((file) => sourceFile.test(file)).flatMap(checkFile));

function checkFile(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const problems: string[] = [];
  function report(comment: Comment, problem: string): void {
    const line = source.slice(0, comment.start).split("\n").length;
    problems.push(`${file}:${line}: ${problem}`);
  }

  const groups: Comment[][] = [];
  for (const comment of parseSync(file, source).comments) {
    const lineStart = source.lastIndexOf("\n", comment.start - 1) + 1;
    if (source.slice(lineStart, comment.start).trim() !== "") {
      report(comment, "Comments go on their own line, above the code they explain.");
      continue;
    }
    if (comment.type === "Block") {
      for (const problem of findDocCommentProblems(comment)) {
        report(comment, problem);
      }
      continue;
    }
    if (directive.test(comment.value)) {
      continue;
    }
    const previous = groups.at(-1)?.at(-1);
    const gap = previous === undefined ? "" : source.slice(previous.end, comment.start);
    if (previous !== undefined && gap.trim() === "" && gap.split("\n").length === 2) {
      groups.at(-1)?.push(comment);
    } else {
      groups.push([comment]);
    }
  }

  for (const group of groups) {
    const [first] = group;
    if (first === undefined) {
      continue;
    }
    if (group.some((comment) => !/^ \S/.test(comment.value))) {
      report(first, 'Line comments start with "// " followed by text.');
      continue;
    }
    const text = group.map((comment) => comment.value.trim()).join(" ");
    for (const problem of findProseProblems(text)) {
      report(first, problem);
    }
  }
  return problems;
}
