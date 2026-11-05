import { readFile, writeFile } from "node:fs/promises";
import { SettingsManager, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import type {
  CompactionSettings,
  EditedText,
  ModelOverrideChange,
  OutputLimits,
  Settings,
  SettingsChange,
} from "./api-types.ts";
import { outputByteRange, outputLineRange } from "./output-limit-ranges.ts";

/** The settings of the user, which last in a file across restarts. */
export interface SettingsStore {
  get(): Settings;
  change(change: Partial<Settings> & Pick<SettingsChange, "tool">): Promise<Settings>;
}

const handBackRange = { min: 5, max: 86_400 };
const piCompaction = SettingsManager.inMemory().getCompactionSettings();

/** The settings that Independum starts with, which a reset goes back to. */
export const builtInSettings: Settings = {
  modelOverrides: {},
  compaction: {
    isEnabled: piCompaction.enabled,
    reserveTokens: piCompaction.reserveTokens,
    keepRecentTokens: piCompaction.keepRecentTokens,
  },
  shell: null,
  disabledTools: [],
  disabledFacts: [],
  knowledgeCutoffs: {},
  outputLimits: { maxLines: 2000, maxBytes: 50 * 1024 },
  handBackSeconds: 120,
  environment: {},
  texts: {},
};

/**
 * Reads the settings of the user from a file, with the built-in value for each setting it lacks,
 * and saves every change there.
 */
export async function createSettings(path: string): Promise<SettingsStore> {
  // Windows editors often start a file with a byte order mark, which JSON does not allow. A file
  // that is missing or no longer JSON gives the built-in settings.
  const saved: unknown = await readFile(path, "utf8")
    .then((text) => JSON.parse(text.replace(/^\uFEFF/, "")))
    .catch(() => ({}));
  const change = readSettingsChange(saved, true) ?? {};
  let settings: Settings = {
    modelOverrides: savedModelOverrides(change.modelOverrides),
    compaction: { ...builtInSettings.compaction, ...change.compaction },
    shell: change.shell ?? builtInSettings.shell,
    disabledTools: change.disabledTools ?? builtInSettings.disabledTools,
    disabledFacts: change.disabledFacts ?? builtInSettings.disabledFacts,
    knowledgeCutoffs: change.knowledgeCutoffs ?? builtInSettings.knowledgeCutoffs,
    outputLimits: change.outputLimits ?? builtInSettings.outputLimits,
    handBackSeconds: change.handBackSeconds ?? builtInSettings.handBackSeconds,
    environment: change.environment ?? builtInSettings.environment,
    texts: editedTextsOf(saved),
  };
  return {
    get: () => settings,
    async change(next) {
      const { tool, ...rest } = next;
      settings = { ...settings, ...rest };
      if (tool !== undefined) {
        const disabled = settings.disabledTools.filter((name) => name !== tool.name);
        settings = {
          ...settings,
          disabledTools: tool.isEnabled ? disabled : [...disabled, tool.name],
        };
      }
      await withFileMutationQueue(path, () =>
        writeFile(path, `${JSON.stringify(settings, null, 2)}\n`),
      );
      return settings;
    },
  };
}

// A file that someone edited by hand keeps its valid settings instead.
/**
 * Returns the settings that a request or a file asks for, or undefined when a request holds a
 * setting that is not valid.
 */
export function readSettingsChange(body: unknown, isLenient = false): SettingsChange | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const fields = body as Record<string, unknown>;
  const change: SettingsChange = {};
  let isValid = true;
  if ("modelOverrides" in fields) {
    const overrides = recordOf(
      fields.modelOverrides,
      (_provider, entry): entry is Record<string, ModelOverrideChange | null> =>
        recordOf(
          entry,
          (_model, value): value is ModelOverrideChange | null =>
            value === null || isModelOverrides(value),
        ) !== undefined,
    );
    if (overrides === undefined) {
      isValid = false;
    } else {
      change.modelOverrides = overrides;
    }
  }
  if ("compaction" in fields) {
    const compaction = compactionOf(fields.compaction);
    if (compaction === undefined) {
      isValid = false;
    } else {
      change.compaction = compaction;
    }
  }
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
  if ("tool" in fields) {
    const { tool } = fields;
    if (
      typeof tool === "object" &&
      tool !== null &&
      "name" in tool &&
      typeof tool.name === "string" &&
      "isEnabled" in tool &&
      typeof tool.isEnabled === "boolean"
    ) {
      change.tool = { name: tool.name, isEnabled: tool.isEnabled };
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
  if ("disabledFacts" in fields) {
    const { disabledFacts } = fields;
    if (Array.isArray(disabledFacts) && disabledFacts.every((id) => typeof id === "string")) {
      change.disabledFacts = disabledFacts;
    } else {
      isValid = false;
    }
  }
  if ("knowledgeCutoffs" in fields) {
    const providers = recordOf(
      fields.knowledgeCutoffs,
      (_provider, models): models is Record<string, string> =>
        recordOf(
          models,
          (_model, cutoff): cutoff is string => typeof cutoff === "string" && cutoff.length > 0,
        ) !== undefined,
    );
    if (providers === undefined) {
      isValid = false;
    } else {
      change.knowledgeCutoffs = providers;
    }
  }
  if ("handBackSeconds" in fields) {
    const { handBackSeconds } = fields;
    // Zero turns hand-back off, so a command holds the reply until it ends.
    if (handBackSeconds === 0 || isWhole(handBackSeconds, handBackRange)) {
      change.handBackSeconds = handBackSeconds;
    } else {
      isValid = false;
    }
  }
  if ("environment" in fields) {
    const environment = environmentOf(fields.environment);
    if (environment === undefined) {
      isValid = false;
    } else {
      change.environment = environment;
    }
  }
  if ("texts" in fields) {
    const texts = textChangesOf(fields.texts);
    if (texts === undefined) {
      isValid = false;
    } else {
      change.texts = texts;
    }
  }
  return isValid || isLenient ? change : undefined;
}

function savedModelOverrides(
  changes: SettingsChange["modelOverrides"],
): Settings["modelOverrides"] {
  return Object.fromEntries(
    Object.entries(changes ?? {}).map(([provider, models]) => [
      provider,
      Object.fromEntries(
        Object.entries(models).flatMap(([id, fields]) =>
          fields === null
            ? []
            : [
                [
                  id,
                  Object.fromEntries(
                    Object.entries(fields).filter(([_key, value]) => value !== null),
                  ),
                ],
              ],
        ),
      ),
    ]),
  );
}

function isModelOverrides(value: unknown): value is ModelOverrideChange {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.entries(value).every(([key, entry]) =>
    (key === "temperature" || key === "contextWindow" || key === "maxOutput") && entry === null
      ? true
      : key === "temperature"
        ? typeof entry === "number" && Number.isFinite(entry) && entry >= 0
        : (key === "contextWindow" || key === "maxOutput") &&
          Number.isSafeInteger(entry) &&
          Number(entry) > 0,
  );
}

function compactionOf(value: unknown): Partial<CompactionSettings> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Object.entries(value).every(([key, entry]) =>
    key === "isEnabled"
      ? typeof entry === "boolean"
      : (key === "reserveTokens" || key === "keepRecentTokens") &&
        Number.isSafeInteger(entry) &&
        Number(entry) >= 0,
  )
    ? (value as Partial<CompactionSettings>)
    : undefined;
}

// A name of a variable starts with a letter or an underscore, as every shell accepts.
function environmentOf(value: unknown): Record<string, string> | undefined {
  return recordOf(
    value,
    (name, text): text is string =>
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && typeof text === "string",
  );
}

function textChangesOf(value: unknown): Record<string, string | null> | undefined {
  return recordOf(
    value,
    (_id, text): text is string | null => text === null || typeof text === "string",
  );
}

function recordOf<Value>(
  value: unknown,
  isValid: (key: string, entry: unknown) => entry is Value,
): Record<string, Value> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  return entries.every(([key, entry]) => isValid(key, entry))
    ? (Object.fromEntries(entries) as Record<string, Value>)
    : undefined;
}

// A file edited by hand keeps each edited text that still has both of its parts.
function editedTextsOf(saved: unknown): Record<string, EditedText> {
  const texts =
    typeof saved === "object" && saved !== null ? (saved as Record<string, unknown>).texts : null;
  if (typeof texts !== "object" || texts === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(texts).filter(
      (entry): entry is [string, EditedText] =>
        typeof entry[1] === "object" &&
        entry[1] !== null &&
        typeof entry[1].text === "string" &&
        typeof entry[1].builtIn === "string",
    ),
  );
}

function outputLimitsOf(value: unknown): OutputLimits | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { maxLines, maxBytes } = value as Record<string, unknown>;
  return isWhole(maxLines, outputLineRange) && isWhole(maxBytes, outputByteRange)
    ? { maxLines, maxBytes }
    : undefined;
}

function isWhole(value: unknown, range: { min: number; max: number }): value is number {
  return Number.isInteger(value) && Number(value) >= range.min && Number(value) <= range.max;
}
