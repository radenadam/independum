import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Api, ImageContent, Model } from "@earendil-works/pi-ai";
import {
  detectSupportedImageMimeTypeFromFile,
  formatDimensionNote,
  resizeImage,
} from "@earendil-works/pi-coding-agent";
import type { AttachmentPreview, AttachmentSettings, AttachmentSummary } from "./api-types.ts";
import { attachmentTexts } from "./attachment-texts.ts";
import { checkConfigurationPath } from "./configuration-files.ts";
import { InputError } from "./create-pending-inputs.ts";
import { isMissingFile } from "./is-missing-file.ts";
import type { ModelTexts } from "./model-texts.ts";
import { decodeBytes } from "./tools/text-file.ts";
import { wrapNote } from "./wrap-note.ts";

interface AttachmentManifest extends Omit<AttachmentSummary, "textBytes"> {
  version: 1;
  uploadedForChatId: string;
  createdAt: number;
}

/** The source references and offsets of attachment input in one canonical Pi message. */
export interface AttachmentPosition {
  id: string;
  isFile: boolean;
  start: number;
  end: number;
  imageIndex: number | null;
}

/** Prepared input whose originals remain available for a later handoff. */
interface PreparedAttachments {
  text: string;
  images: ImageContent[];
  positions: AttachmentPosition[];
}

/** Original files uploaded for a chat and retained while saved input references them. */
export interface Attachments {
  upload(
    chatId: string,
    name: string,
    mimeType: string,
    body: ReadableStream<Uint8Array> | null,
    limit: number,
  ): Promise<AttachmentSummary>;
  source(
    id: string,
    chatId: string,
    retained?: string[],
  ): { summary: AttachmentSummary; path: string; bytes: Buffer };
  preview(
    id: string,
    chatId: string,
    isFile: boolean,
    settings: AttachmentSettings,
    texts: ModelTexts,
    model: Model<Api> | undefined,
    number?: number,
    retained?: string[],
  ): Promise<AttachmentPreview>;
  validate(
    ids: string[],
    files: string[],
    chatId: string,
    settings: AttachmentSettings,
  ): AttachmentSummary[];
  prepare(
    text: string,
    ids: string[],
    files: string[],
    chatId: string,
    settings: AttachmentSettings,
    texts: ModelTexts,
    model: Model<Api>,
  ): Promise<PreparedAttachments>;
  expire(retained: Set<string>, now?: number): void;
  remove(id: string): void;
}

const attachmentIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const retentionMs = 7 * 24 * 60 * 60 * 1000;

/** Retains bounded original uploads and prepares explicit model input without extraction. */
export function createAttachments(directory: string): Attachments {
  const root = resolve(directory);
  function pathOf(id: string): string {
    if (!attachmentIdPattern.test(id)) {
      throw new InputError("This attachment id is invalid.", "invalidAttachment", 400);
    }
    const path = join(root, id);
    checkConfigurationPath(root, path);
    return path;
  }

  function manifestOf(id: string): AttachmentManifest {
    const path = pathOf(id);
    try {
      if (
        lstatSync(path).isSymbolicLink() ||
        lstatSync(join(path, "manifest.json")).isSymbolicLink()
      ) {
        throw new Error("Attachment sources cannot be symbolic links.");
      }
      const value = JSON.parse(
        readFileSync(join(path, "manifest.json"), "utf8"),
      ) as AttachmentManifest;
      if (
        value.version !== 1 ||
        value.id !== id ||
        typeof value.uploadedForChatId !== "string" ||
        !validName(value.name) ||
        typeof value.mimeType !== "string" ||
        !validMediaType(value.mimeType) ||
        !Number.isSafeInteger(value.bytes) ||
        value.bytes < 0 ||
        !Number.isSafeInteger(value.createdAt) ||
        value.createdAt < 0 ||
        !["text", "image", "file"].includes(value.kind) ||
        (value.kind === "text"
          ? !["utf-8", "utf-16le", "utf-16be"].includes(value.encoding ?? "")
          : value.encoding !== null)
      ) {
        throw new Error("The attachment manifest is invalid.");
      }
      return value;
    } catch (error) {
      if (isMissingFile(error)) {
        throw new InputError(
          "Attach this file again. The retained source is missing.",
          "attachmentMissing",
          404,
        );
      }
      throw new InputError("The retained attachment needs repair.", "attachmentInvalid", 422);
    }
  }

  const attachments: Attachments = {
    async upload(chatId, name, mimeType, body, limit) {
      if (!validName(name) || !validMediaType(mimeType)) {
        throw new InputError(
          "An attachment needs a basename of at most 255 characters and a valid media type.",
          "invalidAttachment",
          400,
        );
      }
      const chunks: Uint8Array[] = [];
      let length = 0;
      const reader = body?.getReader();
      try {
        if (reader !== undefined) {
          while (true) {
            const part = await reader.read();
            if (part.done) {
              break;
            }
            length += part.value.byteLength;
            if (length > limit) {
              await reader.cancel();
              throw new InputError(
                `The attachment exceeds the ${limit} byte file limit.`,
                "attachmentTooLarge",
                413,
              );
            }
            chunks.push(part.value);
          }
        }
      } catch (error) {
        throw error instanceof InputError
          ? error
          : new InputError(
              "The attachment upload ended before its bytes could be read.",
              "attachmentUploadFailed",
              400,
            );
      } finally {
        reader?.releaseLock();
      }
      const bytes = Buffer.concat(chunks, length);
      const id = randomUUID();
      const path = pathOf(id);
      try {
        mkdirSync(path, { recursive: true });
        writeFileSync(join(path, "content"), bytes, { flag: "wx" });
        const detected = await detectSupportedImageMimeTypeFromFile(join(path, "content"));
        const isImage = detected != null && detected !== "image/bmp";
        const isBinary =
          mimeType.startsWith("image/") ||
          bytes.subarray(0, 5).toString("ascii") === "%PDF-" ||
          bytes.subarray(0, 2).toString("ascii") === "PK" ||
          bytes.subarray(0, 2).toString("ascii") === "MZ";
        const decoded = isImage || isBinary ? undefined : strictText(bytes);
        const manifest: AttachmentManifest = {
          version: 1,
          id,
          uploadedForChatId: chatId,
          name,
          mimeType: isImage ? detected : mimeType,
          bytes: length,
          kind: isImage ? "image" : decoded === undefined ? "file" : "text",
          encoding: decoded?.encoding ?? null,
          createdAt: Date.now(),
        };
        writeFileSync(join(path, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
          flag: "wx",
        });
        return summaryOf(manifest, decoded?.text);
      } catch (error) {
        rmSync(path, { recursive: true, force: true });
        throw error instanceof InputError
          ? error
          : new InputError("The attachment could not be saved.", "attachmentSaveFailed", 500);
      }
    },
    source(id, chatId, retained = []) {
      const manifest = manifestOf(id);
      if (manifest.uploadedForChatId !== chatId && !retained.includes(id)) {
        throw new InputError(
          "This attachment does not belong to the chat.",
          "attachmentMissing",
          404,
        );
      }
      const path = join(pathOf(id), "content");
      try {
        const stats = lstatSync(path);
        if (
          !stats.isFile() ||
          stats.isSymbolicLink() ||
          stats.nlink !== 1 ||
          stats.size !== manifest.bytes
        ) {
          throw new Error("The retained source changed.");
        }
        const bytes = readFileSync(path);
        const decoded = manifest.kind === "text" ? strictText(bytes) : undefined;
        if (manifest.kind === "text" && decoded === undefined) {
          throw new Error("The retained text changed.");
        }
        return { summary: summaryOf(manifest, decoded?.text), path, bytes };
      } catch (error) {
        throw new InputError(
          `Attach ${JSON.stringify(manifest.name)} again. Its retained source is missing or changed.`,
          isMissingFile(error) ? "attachmentMissing" : "attachmentInvalid",
          isMissingFile(error) ? 404 : 422,
        );
      }
    },
    async preview(id, chatId, isFile, settings, texts, model, number = 1, retained = []) {
      const { summary, bytes, path } = attachments.source(id, chatId, retained);
      let error: string | null = null;
      let image: AttachmentPreview["image"] = null;
      let notice: string | null = null;
      const inline = summary.kind === "text" && !isFile;
      if (summary.bytes > settings.maxFileBytes) {
        error = `The attachment exceeds the ${settings.maxFileBytes} byte file limit.`;
      } else if (inline && summary.textBytes > settings.maxTextBytes) {
        error = `The text exceeds the ${settings.maxTextBytes} byte inline limit. Choose Include file path or remove it.`;
      }
      let modelText = inline ? (strictText(bytes)?.text ?? "") : "";
      if (settings.includeDetails) {
        const details = texts.fill(attachmentTexts.details, {
          name: JSON.stringify(summary.name),
          path: JSON.stringify(path),
          mimeType: summary.mimeType,
          bytes: summary.bytes,
        });
        const content = inline
          ? `${details}\n${texts.fill(attachmentTexts.text, { encoding: summary.encoding ?? "", content: modelText })}`
          : details;
        modelText = wrapNote(texts.fill(attachmentTexts.source, { number }), content, texts);
      }
      if (summary.kind === "image" && !isFile && error === null) {
        try {
          if (settings.resizeImages) {
            const resized = await resizeImage(
              bytes,
              summary.mimeType,
              model?.inputLimits?.images?.resize,
            );
            if (resized === null) {
              throw new Error("Pi could not prepare this image.");
            }
            image = { data: resized.data, mimeType: resized.mimeType };
            const note = formatDimensionNote(resized);
            if (note !== undefined) {
              modelText = [modelText, note].filter(Boolean).join("\n");
            }
            if (resized.wasResized || resized.mimeType !== summary.mimeType) {
              notice = `Prepared as ${resized.mimeType}, ${resized.width} by ${resized.height} pixels. Resizing may change animation.`;
            }
          } else {
            image = { data: bytes.toString("base64"), mimeType: summary.mimeType };
          }
          if (model !== undefined && !model.input.includes("image")) {
            notice = ["This model receives the image details, but not its pixels.", notice]
              .filter(Boolean)
              .join(" ");
          }
        } catch {
          error =
            "The image could not be prepared. Remove it or change the image settings before sending.";
        }
      }
      return {
        ...summary,
        isFile,
        modelText,
        image,
        notice,
        error,
        text: summary.kind === "text" ? (strictText(bytes)?.text ?? "") : "",
      };
    },
    validate(ids, files, chatId, settings) {
      if (ids.length > settings.maxCount) {
        throw new InputError(
          "The attachments exceed the count or original byte limits.",
          "attachmentLimit",
          413,
        );
      }
      if (
        new Set(ids).size !== ids.length ||
        new Set(files).size !== files.length ||
        files.some((id) => !ids.includes(id))
      ) {
        throw new InputError(
          "Attachment ids must be unique and file path choices must name an attached file.",
          "invalidAttachment",
          400,
        );
      }
      const sources = ids.map((id) => attachments.source(id, chatId).summary);
      if (
        sources.some((source) => source.bytes > settings.maxFileBytes) ||
        sources.reduce((total, source) => total + source.bytes, 0) > settings.maxTotalBytes
      ) {
        throw new InputError(
          "The attachments exceed the count or original byte limits.",
          "attachmentLimit",
          413,
        );
      }
      const inline = sources.filter(
        (source) => source.kind === "text" && !files.includes(source.id),
      );
      if (
        inline.some((source) => source.textBytes > settings.maxTextBytes) ||
        inline.reduce((total, source) => total + source.textBytes, 0) > settings.maxTotalTextBytes
      ) {
        throw new InputError(
          "The attachments exceed the inline text limits. Choose Include file path or remove text attachments.",
          "attachmentTextLimit",
          413,
        );
      }
      return sources;
    },
    async prepare(text, ids, files, chatId, settings, texts, model) {
      attachments.validate(ids, files, chatId, settings);
      const result: PreparedAttachments = { text, images: [], positions: [] };
      for (const [index, id] of ids.entries()) {
        const preview = await attachments.preview(
          id,
          chatId,
          files.includes(id),
          settings,
          texts,
          model,
          index + 1,
        );
        if (preview.error !== null) {
          throw new InputError(preview.error, "attachmentPreparation", 422);
        }
        if (result.text !== "" && preview.modelText !== "") {
          result.text += "\n\n";
        }
        const start = result.text.length;
        result.text += preview.modelText;
        result.positions.push({
          id,
          isFile: preview.isFile,
          start,
          end: result.text.length,
          imageIndex: preview.image === null ? null : result.images.length,
        });
        if (preview.image !== null) {
          result.images.push({ type: "image", ...preview.image });
        }
      }
      const limit = model.inputLimits?.images?.maxPerMessage;
      if (limit !== undefined && model.input.includes("image") && result.images.length > limit) {
        throw new InputError(
          `The prompt has ${result.images.length} images and the model accepts at most ${limit}.`,
          "attachmentImageLimit",
          413,
        );
      }
      if (
        result.text.trim() === "" &&
        (result.images.length === 0 || !model.input.includes("image"))
      ) {
        throw new InputError(
          "This prompt contributes no input to the selected model. Add text or enable attachment details.",
          "emptyAttachmentInput",
          400,
        );
      }
      return result;
    },
    expire(retained, now = Date.now()) {
      let entries: string[];
      try {
        entries = readdirSync(root);
      } catch (error) {
        if (isMissingFile(error)) {
          return;
        }
        throw error;
      }
      for (const id of entries) {
        if (attachmentIdPattern.test(id) && !retained.has(id)) {
          const manifest = manifestOf(id);
          if (now - manifest.createdAt >= retentionMs) {
            attachments.remove(id);
          }
        }
      }
    },
    remove(id) {
      rmSync(pathOf(id), { recursive: true, force: true });
    },
  };
  return attachments;
}

function validName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name !== "" &&
    name !== "." &&
    name !== ".." &&
    [...name].length <= 255 &&
    !/[\\/]/.test(name) &&
    [...name].every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && (code < 127 || code > 159);
    })
  );
}

function validMediaType(value: string): boolean {
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(value);
}

function strictText(bytes: Buffer): ReturnType<typeof decodeBytes> {
  const decoded = decodeBytes(bytes);
  if (decoded === undefined || !decoded.isUtf8) {
    return undefined;
  }
  try {
    new TextDecoder(decoded.encoding, { fatal: true }).decode(bytes);
    return decoded;
  } catch {
    return undefined;
  }
}

function summaryOf(manifest: AttachmentManifest, text: string | undefined): AttachmentSummary {
  const { version: _version, uploadedForChatId: _chat, createdAt: _created, ...summary } = manifest;
  return { ...summary, textBytes: text === undefined ? 0 : Buffer.byteLength(text, "utf8") };
}
