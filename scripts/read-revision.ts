import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export interface Revision {
  head: string;
  base: string;
  fingerprint: string;
  contextFingerprint: string;
}

/** Captures the revision and nonignored source contents without reading credential files. */
export function readRevision(folder: string, comparison: string): Revision {
  const head = git(["rev-parse", "HEAD"]);
  const base = git(["rev-parse", "--verify", `${comparison}^{commit}`]);
  const files = [
    ...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0")),
  ]
    .filter((file) => file !== "" && existsSync(join(folder, file)))
    .toSorted();
  const source = createHash("sha256");
  const context = createHash("sha256");
  for (const file of files) {
    if (
      ["auth.json", "models.json", ".env"].includes(basename(file)) ||
      basename(file).startsWith(".env.")
    ) {
      throw new Error("Credential files cannot participate in gate evidence.");
    }
    const content = readFileSync(join(folder, file));
    source.update(file).update("\0").update(content).update("\0");
    if (file.endsWith(".md")) {
      context.update(file).update("\0").update(content).update("\0");
    }
  }
  return {
    head,
    base,
    fingerprint: source.digest("hex"),
    contextFingerprint: context.digest("hex"),
  };

  function git(arguments_: string[]): string {
    return execFileSync("git", arguments_, { cwd: folder, encoding: "utf8" }).trim();
  }
}
