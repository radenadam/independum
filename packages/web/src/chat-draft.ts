import type { AttachmentSummary } from "independum/api-types";

const storagePrefix = "independum.draft.";

/** A retained source reference without original bytes or prepared model content. */
export interface DraftAttachmentReference {
  summary: AttachmentSummary;
  isFile: boolean;
}

interface ChatDraft {
  version: 1;
  text: string;
  attachments: DraftAttachmentReference[];
}

/** Returns the text that the user wrote in a chat and has not sent yet, on this device. */
export function readDraft(chatId: string | null): string {
  return draftOf(chatId).text;
}

/** Keeps the unsent text of a chat on this device, and forgets it once it is empty. */
export function saveDraft(chatId: string | null, text: string): void {
  saveChatDraft(chatId, { ...draftOf(chatId), text });
}

/** Returns the retained sources of an unsent draft without storing their content. */
export function readDraftAttachments(chatId: string): DraftAttachmentReference[] {
  return draftOf(chatId).attachments;
}

/** Saves attachment references without replacing text typed during an upload. */
export function saveDraftAttachments(
  chatId: string,
  attachments: DraftAttachmentReference[],
): void {
  saveChatDraft(chatId, { ...draftOf(chatId), attachments });
}

function saveChatDraft(chatId: string | null, draft: ChatDraft): void {
  if (chatId === null) {
    return;
  }
  if (draft.text === "" && draft.attachments.length === 0) {
    localStorage.removeItem(storagePrefix + chatId);
  } else {
    localStorage.setItem(storagePrefix + chatId, JSON.stringify(draft));
  }
}

function draftOf(chatId: string | null): ChatDraft {
  const stored = chatId === null ? null : localStorage.getItem(storagePrefix + chatId);
  const empty: ChatDraft = { version: 1, text: "", attachments: [] };
  if (stored === null) {
    return empty;
  }
  try {
    const value: unknown = JSON.parse(stored);
    if (
      typeof value === "object" &&
      value !== null &&
      "version" in value &&
      value.version === 1 &&
      "text" in value &&
      typeof value.text === "string" &&
      "attachments" in value &&
      Array.isArray(value.attachments)
    ) {
      return {
        version: 1,
        text: value.text,
        attachments: value.attachments.filter(
          (entry): entry is DraftAttachmentReference =>
            typeof entry?.summary?.id === "string" &&
            typeof entry.summary.name === "string" &&
            typeof entry.isFile === "boolean",
        ),
      };
    }
  } catch {
    // Earlier drafts store literal text instead of a JSON document.
  }
  const migrated: ChatDraft = { ...empty, text: stored };
  saveChatDraft(chatId, migrated);
  return migrated;
}
