import { SettingsManager } from "@earendil-works/pi-coding-agent";
import type {
  CompactionSettings,
  ModelOverrideChange,
  OutputLimits,
  Settings,
  SettingsChange,
} from "./api-types.ts";
import { outputByteRange, outputLineRange } from "./output-limit-ranges.ts";
import { builtInPermissions, validatePermissionPolicy } from "./permission-policy.ts";
import { builtInContext, readContextSettings } from "./read-context-settings.ts";

export const handBackRange: { min: number; max: number } = { min: 5, max: 86_400 };
const piCompaction = SettingsManager.inMemory().getCompactionSettings();

/** The settings that Independum starts with, which a reset goes back to. */
export const builtInSettings: Settings = {
  context: builtInContext,
  permissions: builtInPermissions,
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
 * Returns recognized editor changes, or undefined when any field is invalid or unknown.
 */
export function readSettingsChange(body: unknown): SettingsChange | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const fields = body as Record<string, unknown>;
  if (
    Object.keys(fields).some(
      (key) =>
        ![
          "context",
          "modelOverrides",
          "compaction",
          "shell",
          "disabledTools",
          "disabledFacts",
          "knowledgeCutoffs",
          "outputLimits",
          "handBackSeconds",
          "environment",
          "texts",
          "tool",
          "permissions",
        ].includes(key),
    )
  ) {
    return undefined;
  }
  const change: SettingsChange = {};
  let isValid = true;
  if ("context" in fields) {
    try {
      change.context = readContextSettings(fields.context);
    } catch {
      isValid = false;
    }
  }
  if ("permissions" in fields) {
    try {
      change.permissions = validatePermissionPolicy(fields.permissions);
    } catch {
      isValid = false;
    }
  }
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
  return isValid ? change : undefined;
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
