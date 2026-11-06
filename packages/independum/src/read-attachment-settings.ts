import type { AttachmentSettings } from "./api-types.ts";

/** The built-in limits and preparation choices for attachments. */
export const builtInAttachments: AttachmentSettings = {
  maxCount: 10,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
  maxTextBytes: 200 * 1024,
  maxTotalTextBytes: 512 * 1024,
  includeDetails: true,
  resizeImages: true,
};

/** Resolves omitted attachment settings and rejects invalid limits or unknown fields. */
export function readAttachmentSettings(value: unknown): AttachmentSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected attachment settings.");
  }
  for (const [key, entry] of Object.entries(value)) {
    if (
      !Object.hasOwn(builtInAttachments, key) ||
      (key === "includeDetails" || key === "resizeImages"
        ? typeof entry !== "boolean"
        : !Number.isSafeInteger(entry) || Number(entry) <= 0)
    ) {
      throw new Error(`The attachment setting ${key} is invalid.`);
    }
  }
  const settings = { ...builtInAttachments, ...value };
  if (
    settings.maxTotalBytes < settings.maxFileBytes ||
    settings.maxTotalTextBytes < settings.maxTextBytes
  ) {
    throw new Error("An aggregate attachment limit must be at least its per-file limit.");
  }
  return settings;
}
