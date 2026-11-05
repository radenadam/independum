/** Returns whether a filesystem operation reports a missing path. */
export function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
