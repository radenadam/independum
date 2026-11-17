import { type BigIntStats, lstatSync, readlinkSync } from "node:fs";

/** File system calls through which gate evidence inspects paths and link targets without following links. */
export const gateFileSystem: {
  inspect(path: string): BigIntStats | undefined;
  readLink(path: string): Buffer;
} = {
  // Tests replace these calls to simulate a symbolic link, because creating one on Windows needs
  // Developer Mode or administrator rights.
  inspect(path) {
    return lstatSync(path, { bigint: true, throwIfNoEntry: false });
  },
  readLink(path) {
    return readlinkSync(path, { encoding: "buffer" });
  },
};
