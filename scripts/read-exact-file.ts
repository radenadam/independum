import {
  type BigIntStats,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { fileIdentity } from "../packages/independum/src/file-identity.ts";

/** Inspects a path without following a final link and requires a regular file with one name. */
export function inspectExactFile(path: string): BigIntStats {
  const information = lstatSync(path, { bigint: true });
  requireExactFile(information, path);
  return information;
}

/** Refuses a link or another entry kind, and a file whose other hard links cannot be checked. */
export function requireExactFile(information: BigIntStats, name: string): void {
  if (!information.isFile()) {
    throw new Error(`The gate refuses ${JSON.stringify(name)}, because it is not a regular file.`);
  }
  if (information.nlink !== 1n) {
    throw new Error(
      `The gate refuses ${JSON.stringify(name)}, because it has other hard links whose names cannot be checked.`,
    );
  }
}

/** Reads an inspected file through a descriptor that must open that same file. */
export function readExactFile(
  path: string,
  inspected: BigIntStats = inspectExactFile(path),
  name: string = path,
): Buffer {
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
