import type { BigIntStats } from "node:fs";

// A JavaScript number loses the low bits of a 64-bit Windows file index, so every part keeps all
// of its digits. Windows gives a file recreated under the same name in the same folder within 15
// seconds the creation time of the file it replaces, and Linux can give a new file the index of a
// deleted one. The index and the birth time together therefore tell a replacement apart.
/** Identifies a file by its exact device, file index, and birth time. */
export function fileIdentity(
  information: Pick<BigIntStats, "dev" | "ino" | "birthtimeNs">,
): string {
  return `${information.dev}:${information.ino}:${information.birthtimeNs}`;
}
