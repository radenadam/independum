import { readFile, writeFile } from "node:fs/promises";
import type { OutputLimits, Settings } from "./api-types.ts";

/** The settings of the user, which last in a file across restarts. */
export interface SettingsStore {
  get(): Settings;
  change(change: Partial<Settings>): Promise<Settings>;
}

const lineRange = { min: 10, max: 1_000_000 };
const byteRange = { min: 1024, max: 100 * 1024 * 1024 };
const defaults: Settings = {
  shell: null,
  disabledTools: [],
  outputLimits: { maxLines: 2000, maxBytes: 50 * 1024 },
};

/**
 * Reads the settings of the user from a file, with the default for each setting it lacks, and
 * saves every change there.
 */
export async function createSettings(path: string): Promise<SettingsStore> {
  const saved: unknown = await readFile(path, "utf8").then(
    (text) => JSON.parse(text),
    () => ({}),
  );
  const change = readSettingsChange(saved, true) ?? {};
  let settings: Settings = { ...defaults, ...change };
  return {
    get: () => settings,
    async change(next) {
      settings = { ...settings, ...next };
      await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`);
      return settings;
    },
  };
}

/**
 * Returns the settings that a request or a file asks for, or undefined when a request holds a
 * setting that is not valid. A file that someone edited by hand keeps its valid settings instead.
 */
export function readSettingsChange(
  body: unknown,
  isLenient = false,
): Partial<Settings> | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const fields = body as Record<string, unknown>;
  const change: Partial<Settings> = {};
  let isValid = true;
  if ("shell" in fields) {
    const { shell } = fields;
    if (shell === null || shell === "bash" || shell === "powershell") {
      change.shell = shell;
    } else {
      isValid = false;
    }
  }
  if ("disabledTools" in fields) {
    const { disabledTools } = fields;
    if (Array.isArray(disabledTools) && disabledTools.every((name) => typeof name === "string")) {
      change.disabledTools = disabledTools;
    } else {
      isValid = false;
    }
  }
  if ("outputLimits" in fields) {
    const limits = outputLimitsOf(fields.outputLimits);
    if (limits === undefined) {
      isValid = false;
    } else {
      change.outputLimits = limits;
    }
  }
  return isValid || isLenient ? change : undefined;
}

function outputLimitsOf(value: unknown): OutputLimits | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { maxLines, maxBytes } = value as Record<string, unknown>;
  return isWhole(maxLines, lineRange) && isWhole(maxBytes, byteRange)
    ? { maxLines, maxBytes }
    : undefined;
}

function isWhole(value: unknown, range: { min: number; max: number }): value is number {
  return Number.isInteger(value) && Number(value) >= range.min && Number(value) <= range.max;
}
