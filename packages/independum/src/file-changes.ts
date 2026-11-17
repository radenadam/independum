import { lstatSync, type RmOptions, renameSync, rmSync } from "node:fs";
import { lstat, rename, rm } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { isMissingFile } from "./is-missing-file.ts";

// Windows refuses to replace, move, or delete a file while another handle has it open without
// delete sharing, such as an antivirus scan or the search indexer. On other systems these codes
// mean a real permission problem, so only Windows retries them.
const retriedCodes = ["EPERM", "EACCES", "EBUSY"];
// A recursive removal also finds a folder not yet empty while a file inside is still pending
// deletion, which Node's own `rm` retries too.
const recursiveRemovalCodes = [...retriedCodes, "ENOTEMPTY"];
const retryDelaysMs = [10, 20, 40, 80, 160, 250, 250, 250];

/** Options for removing a path, with the meanings that `rm` gives them. */
export type RemoveOptions = Pick<RmOptions, "force" | "recursive">;

/**
 * Renames a finished file over its target, retrying briefly while Windows reports a file in use.
 */
export async function replaceFile(source: string, target: string): Promise<void> {
  await retry(() => rename(source, target));
}

/** Renames a finished file over its target synchronously, with the retries of `replaceFile`. */
export function replaceFileSync(source: string, target: string): void {
  retrySync(() => renameSync(source, target));
}

/** Moves a file or folder into a free path, with the retries of `replaceFile`. */
export async function movePath(source: string, target: string): Promise<void> {
  await retry(async () => {
    try {
      await lstat(target);
    } catch (error) {
      if (isMissingFile(error)) {
        await rename(source, target);
        return;
      }
      throw error;
    }
    throw occupied(source, target);
  });
}

/** Moves a file or folder into a free path synchronously, with the retries of `replaceFile`. */
export function movePathSync(source: string, target: string): void {
  retrySync(() => {
    if (lstatSync(target, { throwIfNoEntry: false }) !== undefined) {
      throw occupied(source, target);
    }
    renameSync(source, target);
  });
}

/**
 * Removes a file, or a folder with `recursive`, with the retries of `replaceFile` and, when
 * recursive, also while Windows reports a folder not yet empty.
 */
export async function removePath(path: string, options: RemoveOptions = {}): Promise<void> {
  await retry(() => rm(path, options), removalCodes(options));
}

/** Removes a file, or a folder with `recursive`, synchronously, with the retries of `removePath`. */
export function removePathSync(path: string, options: RemoveOptions = {}): void {
  retrySync(() => rmSync(path, options), removalCodes(options));
}

function removalCodes(options: RemoveOptions): string[] {
  return options.recursive === true ? recursiveRemovalCodes : retriedCodes;
}

async function retry(change: () => Promise<void>, codes = retriedCodes): Promise<void> {
  for (const delayMs of [...retryDelaysMs, undefined]) {
    try {
      await change();
      return;
    } catch (error) {
      await setTimeout(retryDelay(error, delayMs, codes));
    }
  }
}

function retrySync(change: () => void, codes = retriedCodes): void {
  for (const delayMs of [...retryDelaysMs, undefined]) {
    try {
      change();
      return;
    } catch (error) {
      // The wait blocks this thread, so a reader in the same thread cannot release the file
      // meanwhile. Only other programs and threads can.
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        retryDelay(error, delayMs, codes),
      );
    }
  }
}

function retryDelay(error: unknown, delayMs: number | undefined, codes: string[]): number {
  if (
    delayMs === undefined ||
    process.platform !== "win32" ||
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    !codes.includes(String(error.code))
  ) {
    throw error;
  }
  return delayMs;
}

// Moves check the target and then rename in two steps because Node offers no rename that refuses
// an existing target, so a path that another program creates between them is still replaced.
function occupied(source: string, target: string): Error {
  return Object.assign(new Error(`Cannot move "${source}" because "${target}" already exists.`), {
    code: "EEXIST",
    syscall: "rename",
    path: source,
    dest: target,
  });
}
