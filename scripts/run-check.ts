import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

/** Runs a check over every file that git tracks or does not ignore, then reports its problems. */
export function runCheck(findProblems: (files: string[]) => string[]): void {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  );
  const files = output.split("\0").filter((file) => file !== "" && existsSync(file));
  const problems = findProblems(files).toSorted();
  for (const problem of problems) {
    process.stderr.write(`${problem}\n`);
  }
  if (problems.length > 0) {
    process.exitCode = 1;
  }
}
