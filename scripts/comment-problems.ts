import type { Comment } from "oxc-parser";
import { findPunctuationProblems } from "./find-punctuation-problems.ts";

const openWorkMarker = /\b(?:todo|fixme|xxx|hack)\b/i;
const personalPronoun = /\b(?:we|us|our|let's|you|your)\b/i;
const firstPersonPronoun = /(?:^|\s)I(?:\s|')/;
const commentedOutCode = /[;{}]$|^(?:import|export|const|let|return|await|if|for)\b/;
const docTag = /(?:^|\s)@[a-z]/;

export function findDocCommentProblems(comment: Comment): string[] {
  const problems: string[] = [];
  function report(problem: string): void {
    problems.push(problem);
  }
  if (!comment.value.startsWith("*") || comment.value.startsWith("**")) {
    report("Block comments are only for doc comments. Use // for other comments.");
    return problems;
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
    return problems;
  }
  const text = lines
    .map((line) => line.replace(/^\s*\*/, "").trim())
    .filter((line) => line !== "")
    .join(" ");
  if (docTag.test(text)) {
    report("Doc comments have no tags. Types already document parameters and return values.");
  }
  const prose = text.replace(/`[^`]*`/g, "code");
  if ((prose.match(/[.!?](?:\s|$)/g)?.length ?? 0) > 1) {
    report("A doc comment is one sentence.");
  }
  for (const problem of findProseProblems(text)) {
    report(problem);
  }
  return problems;
}

export function findProseProblems(text: string): string[] {
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
