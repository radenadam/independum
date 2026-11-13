import { execFileSync } from "node:child_process";
import { type Revision, readRevision } from "./read-revision.ts";

interface PushUpdate {
  head: string;
  remoteHead: string;
}

/** Reads complete branch updates supplied by Git to the pre-push hook. */
export function readPushUpdates(input: string): PushUpdate[] {
  if (input.trim() === "") {
    throw new Error("The push has no branch updates to validate.");
  }
  return input
    .trim()
    .split("\n")
    .map((line) => {
      const fields = line.trim().split(/\s+/);
      const [localReference, head, remoteReference, remoteHead] = fields;
      if (
        fields.length !== 4 ||
        !localReference ||
        !remoteReference ||
        !/^refs\/heads\/.+$/.test(remoteReference) ||
        !head ||
        !remoteHead ||
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head) ||
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(remoteHead) ||
        head.length !== remoteHead.length ||
        /^0+$/.test(head)
      ) {
        throw new Error("Gate validation requires complete nondeleting branch updates from Git.");
      }
      return { head, remoteHead };
    });
}

/** Derives the reviewed range and committed contents from the actual push destination. */
export function readPushRevision(
  folder: string,
  input: string,
  destination: string | undefined,
): Revision {
  const updates = readPushUpdates(input);
  const head = git(["rev-parse", "HEAD"]);
  const bases = new Set<string>();
  for (const update of updates) {
    if (update.head !== head) {
      throw new Error("The gate receipt does not cover an outgoing commit.");
    }
    if (!/^0+$/.test(update.remoteHead)) {
      bases.add(update.remoteHead);
      continue;
    }
    if (!destination) {
      throw new Error("A new branch requires the actual push destination and its default target.");
    }
    let advertisement: string;
    try {
      advertisement = git(["ls-remote", "--symref", "--exit-code", "--", destination, "HEAD"]);
    } catch {
      throw new Error("The push destination default target is unavailable.");
    }
    const references = advertisement.split("\n");
    const targetHead = references[1]?.match(/^([a-f0-9]{40}|[a-f0-9]{64})\tHEAD$/)?.[1];
    if (
      references.length !== 2 ||
      !/^ref: refs\/heads\/[^\s]+\tHEAD$/.test(references[0] ?? "") ||
      targetHead === undefined
    ) {
      throw new Error("A new branch requires an advertised remote default target and commit.");
    }
    const mergeBases = git(["merge-base", "--all", head, targetHead]).split("\n");
    if (mergeBases.length !== 1 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(mergeBases[0] ?? "")) {
      throw new Error(
        "The new branch target must have exactly one merge base with the pushed head.",
      );
    }
    bases.add(mergeBases[0] as string);
  }
  if (bases.size !== 1) {
    throw new Error("One gate receipt cannot cover pushes with different comparison bases.");
  }
  const base = [...bases][0] as string;
  const revision = readRevision(folder, base);
  const committed = readRevision(folder, base, "commit");
  if (revision.base !== base || JSON.stringify(revision) !== JSON.stringify(committed)) {
    throw new Error("The pushed commit must match the reviewed source and context contents.");
  }
  git(["diff", "--quiet", head, "--"]);
  return revision;

  function git(arguments_: string[]): string {
    return execFileSync("git", arguments_, {
      cwd: folder,
      encoding: "utf8",
      stdio: "pipe",
      windowsHide: true,
    }).trim();
  }
}
