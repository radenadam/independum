import { defineText, type ModelText } from "./model-texts.ts";

/** Editable facts included with explicitly attached files. */
export const attachmentTexts: Record<"source" | "details" | "text", ModelText> = {
  source: defineText({
    id: "attachment.source",
    group: "Attachments",
    section: "note",
    label: "The source of each attachment note",
    builtIn: "attachment {number}",
    slots: { number: { meaning: "The position of the attachment in the prompt.", example: "1" } },
  }),
  details: defineText({
    id: "attachment.details",
    group: "Attachments",
    section: "note",
    label: "The original file when attachment details are enabled",
    builtIn: "Name: {name}\nPath: {path}\nMedia type: {mimeType}\nBytes: {bytes}",
    slots: {
      name: { meaning: "The original name as a JSON string.", example: '"notes.txt"' },
      path: {
        meaning: "The saved absolute path as a JSON string.",
        example: '"/home/user/.independum-attachments/id/content"',
      },
      mimeType: { meaning: "The media type of the original file.", example: "text/plain" },
      bytes: { meaning: "The exact original byte count.", example: "18" },
    },
  }),
  text: defineText({
    id: "attachment.text",
    group: "Attachments",
    section: "note",
    label: "Inline text when attachment details are enabled",
    builtIn: "Text encoding: {encoding}\n{content}",
    slots: {
      encoding: { meaning: "The encoding of the original bytes.", example: "utf-8" },
      content: {
        meaning: "The decoded text without changes to its line endings.",
        example: "A note.\r\n",
      },
    },
  }),
};

/** Attachment model texts in their editor order. */
export const attachmentTextList: ModelText[] = Object.values(attachmentTexts);
