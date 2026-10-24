import { readFileSync } from "node:fs";
import { findPunctuationProblems } from "./find-punctuation-problems.ts";
import { runCheck } from "./run-check.ts";

const listMarker = /^\s*(?:-|\d+\.)\s+/;
const tableDelimiterRow = /^\|(?:\s*:?-+:?\s*\|)+$/;
const linkTarget = /\]\([^)]*\)/g;
const bareUrl = /https?:\/\/\S+/g;

runCheck((files) => files.filter((file) => file.endsWith(".md")).flatMap(checkDoc));

function checkDoc(file: string): string[] {
  const problems: string[] = [];
  let isInCodeBlock = false;
  for (const [index, line] of readFileSync(file, "utf8").split("\n").entries()) {
    if (line.trimStart().startsWith("```")) {
      isInCodeBlock = !isInCodeBlock;
      continue;
    }
    if (isInCodeBlock || tableDelimiterRow.test(line)) {
      continue;
    }
    const prose = line.replace(listMarker, "").replace(linkTarget, "]").replace(bareUrl, "url");
    for (const problem of findPunctuationProblems(prose)) {
      problems.push(`${file}:${index + 1}: ${problem}`);
    }
  }
  return problems;
}
