import { readFileSync } from "node:fs";
import { runCheck } from "./run-check.ts";

const outsidePrintableAscii = /[^\x20-\x7e]/;

runCheck((files) => {
  const problems: string[] = [];
  for (const file of files) {
    for (const [index, line] of readFileSync(file, "utf8").split("\n").entries()) {
      if (outsidePrintableAscii.test(line)) {
        problems.push(
          `${file}:${index + 1}: Only printable ASCII is allowed. Write other characters as escapes in code, or in words in prose.`,
        );
      }
    }
  }
  return problems;
});
