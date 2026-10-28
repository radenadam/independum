import { readFileSync } from "node:fs";
import { type Comment, parseSync } from "oxc-parser";
import { findPunctuationProblems } from "./find-punctuation-problems.ts";
import { runCheck } from "./run-check.ts";

const sourceFile = /\.tsx?$/;
const directive = /^ (?:biome-ignore(?:-start|-end)?|@ts-expect-error) \S/;
const openWorkMarker = /\b(?:todo|fixme|xxx|hack)\b/i;
const personalPronoun = /\b(?:we|us|our|let's|you|your)\b/i;
const firstPersonPronoun = /(?:^|\s)I(?:\s|')/;
const commentedOutCode = /[;{}]$|^(?:import|export|const|let|return|await|if|for)\b/;
const docTag = /(?:^|\s)@[a-z]/;

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
      checkDocComment(comment, (problem) => report(comment, problem));
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

function checkDocComment(comment: Comment, report: (problem: string) => void): void {
  if (!comment.value.startsWith("*") || comment.value.startsWith("**")) {
    report("Block comments are only for doc comments. Use // for other comments.");
    return;
  }
  const lines = comment.value.split("\n");
  const isSingleLine = lines.length === 1 && /^\* \S.*\S $/.test(comment.value);
  const isMultiLine =
    lines.length > 2 &&
    lines[0] === "*" &&
    lines.slice(1, -1).every((line) => /^\s*\*(?: \S.*)?$/.test(line)) &&
    lines.at(-1)?.trim() === "";
  if (!isSingleLine && !isMultiLine) {
    report('Doc comments are "/** Text. */" or "/**", " * Text." lines, and " */".');
    return;
  }
  const text = lines
    .map((line) => line.replace(/^\s*\*/, "").trim())
    .filter((line) => line !== "")
    .join(" ");
  if (docTag.test(text)) {
    report("Doc comments have no tags. Types already document parameters and return values.");
  }
  for (const problem of findProseProblems(text)) {
    report(problem);
  }
}

function findProseProblems(text: string): string[] {
  const problems: string[] = [];
  if (openWorkMarker.test(text)) {
    problems.push("Track open work in docs/roadmap.md, not in comments.");
  }
  if (commentedOutCode.test(text)) {
    problems.push("Commented-out code is not allowed. Delete it, because git keeps the history.");
    return problems;
  }
  if (!/^[A-Z`]/.test(text)) {
    problems.push("Comments start with a capital letter.");
  }
  if (!text.endsWith(".")) {
    problems.push("Comments end with a period.");
  }
  if (personalPronoun.test(text) || firstPersonPronoun.test(text)) {
    problems.push("Comments use a neutral voice, without we, you, or I.");
  }
  problems.push(...findPunctuationProblems(text));
  return problems;
}
