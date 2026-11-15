import { lstatSync, mkdirSync, renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { isMissingFile } from "./is-missing-file.ts";

/** Relocates legacy state by rename after checking every destination without reading contents. */
export function migrateStateDirectory(
  directory: string,
  preparePrivate: (path: string) => void,
  isDiscovery = false,
): string {
  const privateFolder = join(directory, "private");
  const runtime = join(directory, "runtime");
  const hasRuntime = exists(runtime);
  const moves = [
    [runtime, privateFolder],
    ...["auth.json", "models.json", "models-store.json"].map((name): [string, string] => [
      join(directory, name),
      join(privateFolder, name),
    ]),
    [
      join(dirname(directory), `${basename(directory)}-attachments`),
      join(directory, "attachments"),
    ],
  ] as const;
  for (const [source, destination] of moves) {
    if (!exists(source)) {
      continue;
    }
    if (
      exists(destination) ||
      (hasRuntime &&
        dirname(destination) === privateFolder &&
        exists(join(runtime, basename(destination))))
    ) {
      throw new Error(
        `Cannot migrate state because both "${source}" and "${destination}" exist. Review the files before migration.`,
      );
    }
    if (lstatSync(source).isSymbolicLink()) {
      throw new Error(`Cannot migrate linked state path "${source}".`);
    }
  }
  if (hasRuntime && exists(join(runtime, "server.json"))) {
    if (!isDiscovery) {
      throw new Error(
        "The legacy server record must be checked before migrating state. Stop the legacy server or run server status before starting.",
      );
    }
    preparePrivate(runtime);
    return runtime;
  }
  mkdirSync(directory, { recursive: true });
  if (hasRuntime) {
    renameSync(runtime, privateFolder);
  }
  preparePrivate(privateFolder);
  for (const [source, destination] of moves.slice(1)) {
    if (exists(source)) {
      renameSync(source, destination);
    }
  }
  return privateFolder;
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
    return false;
  }
}
