import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  type BigIntStats,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { readExactFile, requireExactFile } from "./read-exact-file.ts";
import { isCredentialPath, type Revision } from "./read-revision.ts";

/** Written evidence of one revision's exact change, with the SHA-256 of each file by absolute path. */
export interface GateChange {
  revision: Revision;
  diff: string;
  changedFiles: string;
  untrackedFiles: string[];
  hashes: Record<string, string>;
}

/** A changed path with its Git status, where `??` marks an untracked file outside ignored paths. */
interface ChangedFile {
  status: string;
  path: string;
  previousPath?: string;
  isSymbolicLink?: boolean;
  copy?: string;
}

/** Lists tracked changes against a base commit and untracked files outside ignored paths. */
export function readChangedFiles(folder: string, base: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  const fields = git(folder, ["diff", "--name-status", "-z", "--no-color", base, "--"])
    .toString("utf8")
    .split("\0")
    .filter((field) => field !== "");
  let index = 0;
  while (index < fields.length) {
    const status = fields[index] ?? "";
    const hasPreviousPath = /^[RC]/.test(status);
    const path = fields[index + (hasPreviousPath ? 2 : 1)];
    if (path === undefined) {
      throw new Error("Git returns an incomplete changed-file list.");
    }
    files.push(
      hasPreviousPath ? { status, path, previousPath: fields[index + 1] ?? "" } : { status, path },
    );
    index += hasPreviousPath ? 3 : 2;
  }
  for (const path of git(folder, ["ls-files", "--others", "--exclude-standard", "-z"])
    .toString("utf8")
    .split("\0")) {
    if (path !== "") {
      files.push({ status: "??", path });
    }
  }
  return files;
}

/** Writes the exact worktree change against the reviewed base so every role reads it without a shell. */
export function writeGateChange(folder: string, revision: Revision, directory: string): GateChange {
  const listed = readChangedFiles(folder, revision.base);
  if (listed.some((file) => [file.path, file.previousPath ?? ""].some(isCredentialPath))) {
    throw new Error("Credential files cannot participate in gate evidence.");
  }
  // Git writes every changed path except a deleted one into the diff, so each is inspected before
  // the diff is written.
  const folders = new Set<string>();
  const inspected = new Map(
    listed
      .filter((file) => file.status !== "D")
      .map((file) => [file.path, inspectChangedPath(folder, file.path, folders)]),
  );
  const diff = join(directory, "change.diff");
  writeFileSync(
    diff,
    git(folder, ["diff", "--no-color", "--no-ext-diff", "--no-textconv", revision.base, "--"]),
  );
  const files = listed.map((file): ChangedFile => {
    if (file.status !== "??") {
      return file;
    }
    const source = join(folder, file.path);
    const information = inspected.get(file.path);
    if (information === undefined) {
      throw new Error(
        `The gate refuses ${JSON.stringify(file.path)}, because it changes between inspection and reading.`,
      );
    }
    const copy = join(directory, "untracked", file.path);
    mkdirSync(dirname(copy), { recursive: true });
    if (information.isSymbolicLink()) {
      // Git records a symbolic link as its target path, and the target can name any file.
      writeFileSync(copy, readlinkSync(source, { encoding: "buffer" }));
      return { ...file, isSymbolicLink: true, copy };
    }
    writeFileSync(copy, readExactFile(source, information, file.path));
    return { ...file, copy };
  });
  const changedFiles = join(directory, "changed-files.json");
  writeFileSync(changedFiles, JSON.stringify({ revision, files }, null, 2));
  const untrackedFiles = files.flatMap((file) => (file.copy === undefined ? [] : [file.copy]));
  return {
    revision,
    diff,
    changedFiles,
    untrackedFiles,
    hashes: Object.fromEntries(
      [diff, changedFiles, ...untrackedFiles].map((path) => [path, hashFile(path)]),
    ),
  };
}

/** Requires written change evidence whose files still match the reviewed revision. */
export function readGateChange(value: unknown, revision: Revision): void {
  const change = value as Partial<GateChange> | undefined;
  if (
    change?.revision === undefined ||
    Object.entries(revision).some(
      ([key, expected]) => change.revision?.[key as keyof Revision] !== expected,
    ) ||
    !Array.isArray(change.untrackedFiles) ||
    typeof change.hashes !== "object" ||
    change.hashes === null ||
    [change.diff, change.changedFiles, ...change.untrackedFiles].some(
      (path) =>
        typeof path !== "string" ||
        !isAbsolute(path) ||
        !existsSync(path) ||
        hashFile(path) !== change.hashes?.[path],
    )
  ) {
    throw new Error("The written change no longer matches the reviewed revision.");
  }
}

// Git for Windows reads a junction as a folder and lists or diffs the files behind it, so every
// folder on a changed path must be a real folder. Git elsewhere reports a folder link as one link.
/** Inspects a changed worktree path without following links, or returns nothing for an absent path. */
function inspectChangedPath(
  folder: string,
  path: string,
  folders: Set<string>,
): BigIntStats | undefined {
  let ancestor = "";
  for (const part of path.split("/").slice(0, -1)) {
    ancestor = ancestor === "" ? part : `${ancestor}/${part}`;
    if (!folders.has(ancestor)) {
      const information = lstatSync(join(folder, ancestor), { throwIfNoEntry: false });
      if (information?.isSymbolicLink()) {
        throw new Error(
          `The gate refuses ${JSON.stringify(path)}, because a folder on its path is a link.`,
        );
      }
      if (!information?.isDirectory()) {
        return undefined;
      }
      folders.add(ancestor);
    }
  }
  const information = lstatSync(join(folder, path), { bigint: true, throwIfNoEntry: false });
  if (information !== undefined && !information.isSymbolicLink()) {
    requireExactFile(information, path);
  }
  return information;
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function git(folder: string, arguments_: string[]): Buffer {
  return execFileSync("git", arguments_, { cwd: folder, maxBuffer: 128 * 1024 * 1024 });
}
