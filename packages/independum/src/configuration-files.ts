import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { ConfigurationError } from "./configuration-schema.ts";
import { isMissingFile } from "./is-missing-file.ts";

/** A file replacement within one managed configuration root. */
export interface ConfigurationWrite {
  path: string;
  content: string | null;
}

interface Replacement {
  path: string;
  before: string;
  after: string;
  staged: string;
  backup: string;
  isDeletion: boolean;
}

/** Returns a revision of exact file contents, including absent files. */
export function configurationRevision(contents: (string | null)[]): string {
  return `"${createHash("sha256").update(JSON.stringify(contents)).digest("hex")}"`;
}

/** Returns an effective revision without treating object key order as a settings change. */
export function configurationValueRevision(value: unknown): string {
  return configurationRevision([
    JSON.stringify(value, (_key, entry: unknown) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return entry;
      }
      return Object.fromEntries(
        Object.entries(entry).sort(([first], [second]) => first.localeCompare(second)),
      );
    }),
  ]);
}

/** Reads one optional configuration file without treating other errors as absence. */
export function readConfigurationFile(path: string): string | null {
  try {
    // biome-ignore lint/style/useNamingConvention: TextDecoder names this option ignoreBOM.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(path));
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }
}

/** Rejects paths that leave a managed root or pass through a link. */
export function checkConfigurationPath(root: string, path: string): void {
  const contained = relative(resolve(root), resolve(path));
  if (isAbsolute(contained) || contained === ".." || contained.startsWith(`..${sep}`)) {
    throw new ConfigurationError(
      "The configuration path leaves its managed folder.",
      path,
      "",
      409,
    );
  }
  let current = resolve(root);
  for (const part of ["", ...contained.split(sep)]) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new ConfigurationError(
        "A managed configuration path cannot pass through a symbolic link or junction.",
        current,
        "",
        409,
      );
    }
  }
}

/** Serializes cooperative writes and holds a filesystem lock across each transaction. */
export async function withConfigurationLock<Value>(
  root: string,
  action: () => Promise<Value>,
): Promise<Value> {
  return withFileMutationQueue(root, async () => {
    checkConfigurationPath(root, root);
    await mkdir(root, { recursive: true });
    const lock = join(root, ".configuration-lock");
    checkConfigurationPath(root, lock);
    try {
      await mkdir(lock);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        throw new ConfigurationError(
          "Another configuration writer holds the lock. Remove a stale lock only after its server stops.",
          lock,
          "",
          409,
        );
      }
      throw error;
    }
    try {
      await recoverConfiguration(root);
      return await action();
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  });
}

/** Stages a recoverable transaction before replacing any of its target files. */
export async function writeConfigurationFiles(
  root: string,
  changes: ConfigurationWrite[],
): Promise<void> {
  const replacements: Replacement[] = [];
  const transactionId = randomUUID();
  for (const [index, change] of changes.entries()) {
    checkConfigurationPath(root, change.path);
    checkRegisteredFile(root, change.path);
    const original = readConfigurationFile(change.path);
    if (original === change.content) {
      continue;
    }
    const staged = `.configuration-${transactionId}-${index}.new`;
    const backup = `.configuration-${transactionId}-${index}.old`;
    if (change.content !== null) {
      await writeFile(join(root, staged), change.content, {
        encoding: "utf8",
        flag: "wx",
        flush: true,
      });
    }
    if (original !== null) {
      await writeFile(join(root, backup), original, { encoding: "utf8", flag: "wx", flush: true });
    }
    replacements.push({
      path: relative(root, change.path),
      before: configurationRevision([original]),
      after: configurationRevision([change.content]),
      staged,
      backup,
      isDeletion: change.content === null,
    });
  }
  if (replacements.length === 0) {
    return;
  }
  await writeFile(join(root, ".configuration-transaction.json"), jsonConfiguration(replacements), {
    encoding: "utf8",
    flag: "wx",
    flush: true,
  });
  await recoverConfiguration(root);
}

/** Completes a prepared transaction only while every target retains its recorded old or new state. */
async function recoverConfiguration(root: string): Promise<void> {
  const journal = join(root, ".configuration-transaction.json");
  const text = readConfigurationFile(journal);
  if (text === null) {
    return;
  }
  const entries: unknown = JSON.parse(text);
  if (!Array.isArray(entries)) {
    throw new ConfigurationError("The recovery journal is not an array.", journal, "", 409);
  }
  const replacements = entries as Replacement[];
  for (const entry of replacements) {
    if (
      typeof entry.path !== "string" ||
      typeof entry.before !== "string" ||
      typeof entry.after !== "string" ||
      typeof entry.isDeletion !== "boolean" ||
      !/^\.configuration-[a-f0-9-]+-\d+\.new$/.test(entry.staged) ||
      !/^\.configuration-[a-f0-9-]+-\d+\.old$/.test(entry.backup)
    ) {
      throw new ConfigurationError(
        "The recovery journal contains an invalid replacement.",
        journal,
        "",
        409,
      );
    }
    const path = join(root, entry.path);
    checkConfigurationPath(root, path);
    checkRegisteredFile(root, path);
    const revision = configurationRevision([readConfigurationFile(path)]);
    if (revision !== entry.before && revision !== entry.after) {
      throw new ConfigurationError(
        "The file changed during a configuration transaction. Recovery keeps the staged file and backup for review.",
        path,
        "",
        409,
      );
    }
    if (revision !== entry.after && !entry.isDeletion) {
      const staged = await readFile(join(root, entry.staged), "utf8");
      if (configurationRevision([staged]) !== entry.after) {
        throw new ConfigurationError(
          "A staged file no longer matches the recovery journal.",
          journal,
          "",
          409,
        );
      }
    }
  }
  for (const entry of replacements) {
    const path = join(root, entry.path);
    const revision = configurationRevision([readConfigurationFile(path)]);
    if (revision === entry.after) {
      continue;
    }
    if (revision !== entry.before) {
      throw new ConfigurationError(
        "The file changed before its replacement. Recovery keeps both versions.",
        path,
        "",
        409,
      );
    }
    await mkdir(dirname(path), { recursive: true });
    if (entry.isDeletion) {
      await rm(path, { force: true });
    } else {
      await rename(join(root, entry.staged), path);
    }
  }
  await rm(journal);
  for (const entry of replacements) {
    await rm(join(root, entry.staged), { force: true });
    await rm(join(root, entry.backup), { force: true });
  }
}

/** Writes the plain JSON shape used by every configuration document. */
export function jsonConfiguration(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function checkRegisteredFile(root: string, path: string): void {
  const parts = relative(root, path).split(sep);
  const [folder, id, file] = parts;
  const isAllowed =
    (parts.length === 1 && folder === "settings.json") ||
    (parts.length === 2 && folder === "chat-settings" && /^[a-zA-Z0-9-]+\.json$/.test(id ?? "")) ||
    (parts.length === 2 && folder === "migrations" && id === "settings-before-profiles.json") ||
    (parts.length === 3 &&
      folder === "profiles" &&
      /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id ?? "") &&
      ["profile.json", "SYSTEM.md", "model-texts.json"].includes(file ?? ""));
  if (!isAllowed) {
    throw new ConfigurationError(
      "This file is not a registered configuration resource.",
      path,
      "",
      409,
    );
  }
}
