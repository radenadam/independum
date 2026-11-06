import { join } from "node:path";
import { addedFactTexts } from "./added-facts.ts";
import { allTexts } from "./agent-texts.ts";
import type {
  ChatSettingsDocument,
  ConfigurationIssue,
  ProfileBundle,
  ProfileReference,
  ProjectSettingsDocument,
  UserSettingsDocument,
} from "./api-types.ts";
import { thinkingLevels } from "./api-types.ts";
import { outputByteRange, outputLineRange } from "./output-limit-ranges.ts";
import { validatePermissionPolicy } from "./permission-policy.ts";
import { readContextSettings } from "./read-context-settings.ts";
import { handBackRange, readSettingsChange } from "./read-settings-change.ts";

/** A configuration failure with the file and location that need repair. */
export class ConfigurationError extends Error {
  status: 400 | 409 | 412 | 422 | 428;
  issues: ConfigurationIssue[];

  constructor(
    message: string,
    file: string,
    pointer: string,
    status: ConfigurationError["status"] = 422,
  ) {
    super(`${file}${pointer}: ${message}`);
    this.status = status;
    this.issues = [{ file, pointer, message }];
  }
}

/** Reads strict JSON and rejects duplicate keys with their exact location. */
export function parseConfigurationJson(text: string, file: string): unknown {
  const input = text.replace(/^\uFEFF/, "");
  let position = 0;

  function fail(pointer: string, message: string): never {
    const prefix = input.slice(0, position);
    const line = prefix.split("\n").length;
    const column = position - prefix.lastIndexOf("\n");
    throw new ConfigurationError(`${message} Line ${line}, column ${column}.`, file, pointer, 400);
  }

  function skipSpace(): void {
    while (/[\t\n\r ]/.test(input[position] ?? "x")) {
      position += 1;
    }
  }

  function string(pointer: string): string {
    const start = position;
    position += 1;
    while (position < input.length) {
      const character = input[position++];
      if (character === "\\") {
        position += 1;
      } else if (character === '"') {
        try {
          return JSON.parse(input.slice(start, position)) as string;
        } catch {
          fail(pointer, "The string is not valid JSON.");
        }
      }
    }
    return fail(pointer, "The string has no closing quote.");
  }

  function value(pointer: string): unknown {
    skipSpace();
    const character = input[position];
    if (character === '"') {
      return string(pointer);
    }
    if (character === "{" || character === "[") {
      position += 1;
      const isObject = character === "{";
      const closing = isObject ? "}" : "]";
      const object: Record<string, unknown> = Object.create(null);
      const array: unknown[] = [];
      skipSpace();
      if (input[position] !== closing) {
        while (true) {
          skipSpace();
          let key = String(array.length);
          if (isObject) {
            if (input[position] !== '"') {
              fail(pointer, "An object key needs double quotes.");
            }
            key = string(pointer);
            skipSpace();
            if (input[position++] !== ":") {
              fail(pointer, "An object key needs a colon before its value.");
            }
            if (Object.hasOwn(object, key)) {
              fail(`${pointer}/${escapePointer(key)}`, "The key appears more than once.");
            }
          }
          const entry = value(`${pointer}/${escapePointer(key)}`);
          if (isObject) {
            object[key] = entry;
          } else {
            array.push(entry);
          }
          skipSpace();
          if (input[position] !== ",") {
            break;
          }
          position += 1;
        }
      }
      if (input[position++] !== closing) {
        fail(pointer, `Expected ${closing}.`);
      }
      return isObject ? object : array;
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      input.slice(position),
    );
    if (match === null) {
      return fail(pointer, "Expected a JSON value.");
    }
    position += match[0].length;
    return JSON.parse(match[0]) as unknown;
  }

  const result = value("");
  skipSpace();
  if (position !== input.length) {
    fail("", "Unexpected text after the JSON value.");
  }
  return result;
}

/** Validates a portable profile directory name. */
export function validateProfileId(id: string): void {
  if (
    id.length > 64 ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) ||
    /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(id)
  ) {
    throw new ConfigurationError(
      "Use at most 64 lowercase letters, digits, and single hyphens, starting with a letter, without a reserved device name.",
      "Profile",
      "/id",
    );
  }
}

/** Validates a user settings document without dropping unknown fields. */
export function validateUserSettings(value: unknown, file: string): UserSettingsDocument {
  const fields = documentOf(value, file, ["defaultProfile", "knowledgeCutoffs", "messages"]);
  referenceOf(fields.defaultProfile, file, "/defaultProfile", true);
  if (fields.messages !== undefined) {
    const messages = fields.messages;
    if (
      typeof messages !== "object" ||
      messages === null ||
      Array.isArray(messages) ||
      Object.keys(messages).some((key) => key !== "whileReplying") ||
      ("whileReplying" in messages &&
        messages.whileReplying !== "queue" &&
        messages.whileReplying !== "steer")
    ) {
      throw new ConfigurationError(
        "Expected a whileReplying choice of queue or steer.",
        file,
        "/messages",
      );
    }
  }
  if (
    fields.knowledgeCutoffs !== undefined &&
    readSettingsChange({ knowledgeCutoffs: fields.knowledgeCutoffs }) === undefined
  ) {
    throw new ConfigurationError(
      "Expected provider and model ids mapped to nonempty text values.",
      file,
      "/knowledgeCutoffs",
    );
  }
  return value as UserSettingsDocument;
}

/** Validates the default profile of one exact project folder. */
export function validateProjectSettings(value: unknown, file: string): ProjectSettingsDocument {
  const fields = documentOf(value, file, ["profile"]);
  if (fields.profile !== undefined) {
    referenceOf(fields.profile, file, "/profile");
  }
  return value as ProjectSettingsDocument;
}

/** Validates a chat's profile selection and model overrides. */
export function validateChatSettings(value: unknown, file: string): ChatSettingsDocument {
  const fields = documentOf(value, file, ["profile", "overrides"]);
  referenceOf(fields.profile, file, "/profile");
  if (fields.overrides !== undefined) {
    const overrides = objectOf(fields.overrides, file, "/overrides", ["model", "thinkingLevel"]);
    validateChoices(overrides, file, "/overrides");
  }
  return value as ChatSettingsDocument;
}

/** Validates every owned file in a profile bundle. */
export function validateProfileBundle(value: unknown, folder: string): ProfileBundle {
  const bundle = objectOf(value, folder, "", ["profile", "systemPrompt", "modelTexts"]);
  const file = join(folder, "profile.json");
  const profile = documentOf(bundle.profile, file, ["name", "settings"]);
  if (typeof profile.name !== "string" || profile.name.trim() === "") {
    throw new ConfigurationError("Expected a nonempty name.", file, "/name");
  }
  if (profile.settings !== undefined) {
    validateRuntimeSettings(profile.settings, file);
  }
  if (bundle.systemPrompt !== null && typeof bundle.systemPrompt !== "string") {
    throw new ConfigurationError(
      "Expected text or null for an absent SYSTEM.md.",
      folder,
      "/systemPrompt",
    );
  }
  if (bundle.modelTexts !== null) {
    const textFile = join(folder, "model-texts.json");
    const document = documentOf(bundle.modelTexts, textFile, ["texts", "systemPromptBuiltIn"]);
    if (
      document.systemPromptBuiltIn !== undefined &&
      typeof document.systemPromptBuiltIn !== "string"
    ) {
      throw new ConfigurationError("Expected text.", textFile, "/systemPromptBuiltIn");
    }
    if (document.texts !== undefined) {
      const texts = objectOf(document.texts, textFile, "/texts");
      for (const [id, entry] of Object.entries(texts)) {
        const pointer = `/texts/${escapePointer(id)}`;
        if (id === "systemPrompt" || !allTexts.some((text) => text.id === id)) {
          throw new ConfigurationError(
            "This model text id is not registered here. The base prompt belongs in SYSTEM.md.",
            textFile,
            pointer,
          );
        }
        const edit = objectOf(entry, textFile, pointer, ["text", "builtIn"]);
        if (
          typeof edit.text !== "string" ||
          (edit.builtIn !== undefined && typeof edit.builtIn !== "string")
        ) {
          throw new ConfigurationError(
            "An edit needs text and may record its builtIn text.",
            textFile,
            pointer,
          );
        }
      }
    }
  }
  return value as ProfileBundle;
}

/** Validates legacy runtime fields before migration preserves their exact values. */
export function validateLegacySettings(value: unknown, file: string): Record<string, unknown> {
  const fields = objectOf(value, file, "", [
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
  ]);
  const { texts, knowledgeCutoffs, ...runtime } = fields;
  validateRuntimeSettings(runtime, file, "");
  if (knowledgeCutoffs !== undefined && readSettingsChange({ knowledgeCutoffs }) === undefined) {
    throw new ConfigurationError(
      "Expected provider and model ids mapped to nonempty text values.",
      file,
      "/knowledgeCutoffs",
    );
  }
  if (texts !== undefined) {
    for (const [id, entry] of Object.entries(objectOf(texts, file, "/texts"))) {
      const edit = objectOf(entry, file, `/texts/${escapePointer(id)}`, ["text", "builtIn"]);
      if (
        !allTexts.some((text) => text.id === id) ||
        typeof edit.text !== "string" ||
        typeof edit.builtIn !== "string"
      ) {
        throw new ConfigurationError(
          "Expected a registered text with text and builtIn strings.",
          file,
          `/texts/${escapePointer(id)}`,
        );
      }
    }
  }
  return fields;
}

function validateRuntimeSettings(value: unknown, file: string, pointer = "/settings"): void {
  const fields = objectOf(value, file, pointer, [
    "context",
    "model",
    "thinkingLevel",
    "modelOverrides",
    "compaction",
    "shell",
    "disabledTools",
    "disabledFacts",
    "outputLimits",
    "handBackSeconds",
    "environment",
    "permissions",
  ]);
  validateChoices(fields, file, pointer);
  if (fields.context !== undefined) {
    try {
      readContextSettings(fields.context);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "/context: Invalid context settings.";
      const boundary = message.indexOf(": ");
      throw new ConfigurationError(
        message.slice(boundary + 2),
        file,
        `${pointer}${message.slice(0, boundary)}`,
      );
    }
  }
  validateRuntimeFields(fields, file, pointer);
  if (fields.permissions !== undefined) {
    try {
      fields.permissions = validatePermissionPolicy(fields.permissions);
    } catch (error) {
      throw new ConfigurationError(
        error instanceof Error ? error.message : "Invalid permission policy.",
        file,
        `${pointer}/permissions`,
      );
    }
  }
  const { model: _model, thinkingLevel: _thinkingLevel, ...runtime } = fields;
  for (const [key, entry] of Object.entries(runtime)) {
    if (readSettingsChange({ [key]: entry }) === undefined) {
      throw new ConfigurationError(
        key === "shell"
          ? "Expected null, powershell, or bash."
          : key === "handBackSeconds"
            ? `Expected zero, or an integer from ${handBackRange.min} through ${handBackRange.max}.`
            : `The value of ${key} has an invalid type or shape.`,
        file,
        `${pointer}/${key}`,
      );
    }
  }
  for (const [key, names] of [
    ["disabledTools", ["Read", "Write", "Edit", "Shell", "CheckCommand", "StopCommand"]],
    ["disabledFacts", addedFactTexts.map((text) => text.id)],
  ] as const) {
    const entries = fields[key] as string[] | undefined;
    if (
      entries !== undefined &&
      (new Set(entries).size !== entries.length ||
        entries.some((name) => !names.some((registered) => registered === name)))
    ) {
      throw new ConfigurationError(
        "Expected registered names without duplicates.",
        file,
        `${pointer}/${key}`,
      );
    }
  }
  if (fields.outputLimits !== undefined) {
    objectOf(fields.outputLimits, file, `${pointer}/outputLimits`, ["maxLines", "maxBytes"]);
  }
}

function validateRuntimeFields(
  fields: Record<string, unknown>,
  file: string,
  pointer: string,
): void {
  if (fields.outputLimits !== undefined) {
    const limits = objectOf(fields.outputLimits, file, `${pointer}/outputLimits`, [
      "maxLines",
      "maxBytes",
    ]);
    for (const [key, range] of [
      ["maxLines", outputLineRange],
      ["maxBytes", outputByteRange],
    ] as const) {
      const value = limits[key];
      if (!Number.isInteger(value) || Number(value) < range.min || Number(value) > range.max) {
        throw new ConfigurationError(
          `Expected an integer from ${range.min} through ${range.max}.`,
          file,
          `${pointer}/outputLimits/${key}`,
        );
      }
    }
  }
  if (fields.environment !== undefined) {
    for (const [name, value] of Object.entries(
      objectOf(fields.environment, file, `${pointer}/environment`),
    )) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new ConfigurationError(
          "An environment name starts with a letter or underscore and contains only letters, digits, and underscores.",
          file,
          `${pointer}/environment/${escapePointer(name)}`,
        );
      }
      if (typeof value !== "string") {
        throw new ConfigurationError(
          "Expected a text value.",
          file,
          `${pointer}/environment/${escapePointer(name)}`,
        );
      }
    }
  }
  if (fields.compaction !== undefined) {
    const compaction = objectOf(fields.compaction, file, `${pointer}/compaction`, [
      "isEnabled",
      "reserveTokens",
      "keepRecentTokens",
    ]);
    for (const [key, value] of Object.entries(compaction)) {
      if (
        key === "isEnabled"
          ? typeof value !== "boolean"
          : !Number.isSafeInteger(value) || Number(value) < 0
      ) {
        throw new ConfigurationError(
          key === "isEnabled"
            ? "Expected true or false."
            : "Expected a nonnegative safe integer, including zero.",
          file,
          `${pointer}/compaction/${key}`,
        );
      }
    }
  }
  if (fields.modelOverrides !== undefined) {
    const providers = objectOf(fields.modelOverrides, file, `${pointer}/modelOverrides`);
    for (const [provider, models] of Object.entries(providers)) {
      const providerPointer = `${pointer}/modelOverrides/${escapePointer(provider)}`;
      for (const [id, overrides] of Object.entries(objectOf(models, file, providerPointer))) {
        const modelPointer = `${providerPointer}/${escapePointer(id)}`;
        for (const [key, value] of Object.entries(
          objectOf(overrides, file, modelPointer, ["contextWindow", "maxOutput", "temperature"]),
        )) {
          if (
            key === "temperature"
              ? typeof value !== "number" || !Number.isFinite(value) || value < 0
              : !Number.isSafeInteger(value) || Number(value) <= 0
          ) {
            throw new ConfigurationError(
              key === "temperature"
                ? "Expected a finite nonnegative number."
                : "Expected a positive safe integer.",
              file,
              `${modelPointer}/${key}`,
            );
          }
        }
      }
    }
  }
}

function validateChoices(fields: Record<string, unknown>, file: string, pointer: string): void {
  if (fields.model !== undefined && fields.model !== null) {
    const model = objectOf(fields.model, file, `${pointer}/model`, ["providerId", "modelId"]);
    if (
      typeof model.providerId !== "string" ||
      model.providerId === "" ||
      typeof model.modelId !== "string" ||
      model.modelId === ""
    ) {
      throw new ConfigurationError(
        "Expected nonempty providerId and modelId strings.",
        file,
        `${pointer}/model`,
      );
    }
  }
  if (
    fields.thinkingLevel !== undefined &&
    fields.thinkingLevel !== null &&
    !thinkingLevels.some((level) => level === fields.thinkingLevel)
  ) {
    throw new ConfigurationError(
      "Expected null or a Pi thinking level.",
      file,
      `${pointer}/thinkingLevel`,
    );
  }
}

function referenceOf(
  value: unknown,
  file: string,
  pointer: string,
  isUserOnly = false,
): ProfileReference {
  const fields = objectOf(value, file, pointer, ["scope", "id"]);
  if (
    (fields.scope !== "user" && (isUserOnly || fields.scope !== "project")) ||
    typeof fields.id !== "string"
  ) {
    throw new ConfigurationError(
      isUserOnly
        ? "Expected a user profile reference."
        : "Expected a user or project profile reference.",
      file,
      pointer,
    );
  }
  validateProfileId(fields.id);
  return value as ProfileReference;
}

function documentOf(value: unknown, file: string, keys: string[]): Record<string, unknown> {
  const fields = objectOf(value, file, "", ["formatVersion", ...keys]);
  if (fields.formatVersion !== 1) {
    throw new ConfigurationError("Expected formatVersion 1.", file, "/formatVersion");
  }
  return fields;
}

function objectOf(
  value: unknown,
  file: string,
  pointer: string,
  keys?: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConfigurationError("Expected an object.", file, pointer);
  }
  if (keys !== undefined) {
    for (const key of Object.keys(value)) {
      if (!keys.includes(key)) {
        throw new ConfigurationError(
          "This field is not supported.",
          file,
          `${pointer}/${escapePointer(key)}`,
        );
      }
    }
  }
  return value as Record<string, unknown>;
}

export function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
