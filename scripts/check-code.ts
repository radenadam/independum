import { readFileSync } from "node:fs";
import { findCodeProblems } from "./find-code-problems.ts";
import { findDuplicateRanges } from "./find-duplicate-ranges.ts";
import { runCheck } from "./run-check.ts";

runCheck((files) => {
  const sources = files
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => ({ file, code: readFileSync(file, "utf8") }));
  return [
    ...sources.flatMap(({ file, code }) => findCodeProblems(file, code)),
    ...findDuplicateRanges(sources),
  ];
});
