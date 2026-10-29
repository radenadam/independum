import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/** Creates an empty folder for the tests of one file, which goes away once they have run. */
export function createTestFolder(name: string): string {
  const folder = mkdtempSync(join(tmpdir(), `independum-${name}-`));
  afterAll(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
}
