import { type BigIntStats, closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { fileIdentity } from "../packages/independum/src/file-identity.ts";
import { gateFileSystem } from "./gate-file-system.ts";

/** Inspects a path in a trusted folder without following a link on any component, or returns nothing for an absent path. */
export function inspectLinkFreePath(
  folder: string,
  path: string,
  name: string = path,
  folders: Set<string> = new Set(),
): BigIntStats | undefined {
  const inside = relative(folder, path);
  const parts = inside.split(sep);
  // A POSIX system resolves a parent part after following any link before it, so a dot part could
  // lead the opened path away from the components checked below.
  if (
    !isAbsolute(path) ||
    isAbsolute(inside) ||
    path.split(sep === "\\" ? /[\\/]/ : "/").some((part) => part === "." || part === "..") ||
    parts.some((part) => part === "" || part === "..")
  ) {
    throw new Error(
      `The gate refuses ${JSON.stringify(name)}, because it is not a normalized absolute path inside ${JSON.stringify(folder)}.`,
    );
  }
  let ancestor = folder;
  for (const part of parts.slice(0, -1)) {
    ancestor = join(ancestor, part);
    if (!folders.has(ancestor)) {
      const information = gateFileSystem.inspect(ancestor);
      if (information?.isSymbolicLink()) {
        throw new Error(
          `The gate refuses ${JSON.stringify(name)}, because a folder on its path is a link.`,
        );
      }
      if (!information?.isDirectory()) {
        return undefined;
      }
      folders.add(ancestor);
    }
  }
  return gateFileSystem.inspect(join(folder, ...parts));
}

/** Inspects a file in a trusted folder without following links and requires a regular file with one name. */
export function inspectExactFile(folder: string, path: string): BigIntStats {
  const information = inspectLinkFreePath(folder, path);
  requireExactFile(information, path);
  return information;
}

/** Refuses an absent path, a link or another entry kind, and a file whose other hard links cannot be checked. */
export function requireExactFile(
  information: BigIntStats | undefined,
  name: string,
): asserts information is BigIntStats {
  if (!information?.isFile()) {
    throw new Error(`The gate refuses ${JSON.stringify(name)}, because it is not a regular file.`);
  }
  if (information.nlink !== 1n) {
    throw new Error(
      `The gate refuses ${JSON.stringify(name)}, because it has other hard links whose names cannot be checked.`,
    );
  }
}

/** Reads an inspected file through a descriptor that must open that same file. */
export function readExactFile(path: string, inspected: BigIntStats, name: string = path): Buffer {
  const changed = new Error(
    `The gate refuses ${JSON.stringify(name)}, because it changes between inspection and reading.`,
  );
  let descriptor: number;
  try {
    // Node offers no open flag that refuses a final link on Windows, so the identity check below
    // catches a swap there.
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw changed;
  }
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink !== 1n ||
      fileIdentity(opened) !== fileIdentity(inspected)
    ) {
      throw changed;
    }
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
