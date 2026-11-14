import { createHash } from "node:crypto";
import type { AttachmentPosition } from "./create-attachments.ts";

/** Locates captured attachment text by its exact prefix, length, and digest after input hooks. */
export function locateAttachmentText(text: string, position: AttachmentPosition): string | null {
  const { textPrefix, textHash, start, end } = position;
  if (
    textPrefix === undefined ||
    textHash === undefined ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start
  ) {
    return null;
  }
  const length = end - start;
  if (length === 0) {
    return textHash === createHash("sha256").update("").digest("hex") ? "" : null;
  }
  if (textPrefix === "" || textPrefix.length > length) {
    return null;
  }
  let from = text.indexOf(textPrefix);
  while (from !== -1) {
    const candidate = text.slice(from, from + length);
    if (
      candidate.length === length &&
      createHash("sha256").update(candidate).digest("hex") === textHash
    ) {
      return candidate;
    }
    from = text.indexOf(textPrefix, from + 1);
  }
  return null;
}
