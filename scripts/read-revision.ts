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
export function readRevision(
  folder: string,
  comparison: string,
  contents: "worktree" | "commit" = "worktree",
): Revision {
  const head = git(["rev-parse", "HEAD"]);
  const base = git(["rev-parse", "--verify", `${comparison}^{commit}`]);
  const files = [
    ...new Set(
      git(
        contents === "commit"
          ? ["ls-tree", "-r", "--name-only", "-z", head]
          : ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      ).split("\0"),
    ),
  ]
    .filter((file) => file !== "" && (contents === "commit" || existsSync(join(folder, file))))
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
    if (contents === "commit" && /[\r\n]/.test(file)) {
      throw new Error("Committed gate paths cannot contain line breaks.");
    }
  }
  const blobs =
    contents === "commit"
      ? execFileSync("git", ["cat-file", "--batch"], {
          cwd: folder,
          input: files.map((file) => `${head}:${file}\n`).join(""),
          maxBuffer: 128 * 1024 * 1024,
        })
      : undefined;
  let offset = 0;
  for (const file of files) {
    let content: Buffer;
    if (blobs === undefined) {
      content = readFileSync(join(folder, file));
    } else {
      const end = blobs.indexOf(10, offset);
      const size = blobs
        .subarray(offset, end)
        .toString("utf8")
        .match(/^[a-f0-9]+ blob (\d+)$/)?.[1];
      if (end < offset || size === undefined || end + Number(size) + 1 >= blobs.length) {
        throw new Error("Committed gate contents must be complete Git blobs.");
      }
      content = blobs.subarray(end + 1, end + 1 + Number(size));
      offset = end + Number(size) + 2;
      if (blobs[offset - 1] !== 10) {
        throw new Error("Committed gate contents must end at the declared blob boundary.");
      }
    }
    source.update(file).update("\0").update(content).update("\0");
    if (file.endsWith(".md")) {
      context.update(file).update("\0").update(content).update("\0");
    }
  }
  if (blobs !== undefined && offset !== blobs.length) {
    throw new Error("Committed gate contents include unexpected data.");
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
