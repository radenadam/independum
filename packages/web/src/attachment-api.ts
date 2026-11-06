import type { AttachmentPreview, AttachmentSummary } from "independum/api-types";
import { chatPath } from "./chat-api.ts";
import { readResponse } from "./profile-api.ts";
import { requestApi } from "./request-api.ts";

/** Uploads one original file through the same bounded path used by paste and drop. */
export async function uploadAttachment(chatId: string, file: File): Promise<AttachmentSummary> {
  return readResponse(
    await requestApi(chatPath(chatId, `/attachments?name=${encodeURIComponent(file.name)}`), {
      file,
    }),
  );
}

/** Prepares the attachment with the chat's current model and profile settings. */
export async function previewAttachment(
  chatId: string,
  id: string,
  isFile: boolean,
): Promise<AttachmentPreview> {
  return readResponse(
    await requestApi(
      chatPath(chatId, `/attachments/${encodeURIComponent(id)}?form=${isFile ? "file" : "inline"}`),
    ),
  );
}

/** Fetches original bytes with authorization without putting a token in a resource URL. */
export async function attachmentUrl(chatId: string, id: string): Promise<string> {
  const response = await requestApi(
    chatPath(chatId, `/attachments/${encodeURIComponent(id)}/content`),
  );
  if (!response.ok) {
    throw new Error("Attach this file again. The original cannot be loaded.");
  }
  return URL.createObjectURL(await response.blob());
}
