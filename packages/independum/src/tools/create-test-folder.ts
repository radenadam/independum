import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/** Creates an empty folder for the tests of one file, which goes away once they have run. */
export function createTestFolder(name: string): string {
  const folder = mkdtempSync(join(tmpdir(), `independum-${name}-`));
  afterAll(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
}

/** Creates an isolated state folder and project within a test file's retained folder. */
export function createTestProject(
  parent: string,
  isLinked = false,
): { directory: string; project: string } {
  const target = mkdtempSync(join(parent, "case-"));
  const directory = isLinked ? `${target}-linked` : target;
  if (isLinked) {
    symlinkSync(target, directory, "junction");
  }
  const project = join(directory, "project");
  mkdirSync(project);
  return { directory, project };
}
