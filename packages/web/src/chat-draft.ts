import type { AttachmentSummary } from "independum/api-types";

const storagePrefix = "independum.draft.";

/** A retained source reference without original bytes or prepared model content. */
export interface DraftAttachmentReference {
  summary: AttachmentSummary;
  isFile: boolean;
}

/** A local prompt draft and the ordinary draft saved while an edit is open. */
export interface ChatDraft {
  version: 1;
  text: string;
  attachments: DraftAttachmentReference[];
  edit: {
    id: string;
    sourceUserEntryId: string;
    expectedLeafId: string | null;
    expectedRevision: number;
    ordinaryText: string;
    ordinaryAttachments: DraftAttachmentReference[];
    imageCount: number;
  } | null;
}

/** Returns the unsent draft of a chat on this device. */
export function readDraft(chatId: string | null): ChatDraft {
  const stored = chatId === null ? null : localStorage.getItem(storagePrefix + chatId);
  const empty: ChatDraft = { version: 1, text: "", attachments: [], edit: null };
  if (stored === null) {
    return empty;
  }
  try {
    const value = JSON.parse(stored) as ChatDraft;
    if (
      value?.version === 1 &&
      typeof value.text === "string" &&
      isAttachmentReferences(value.attachments) &&
      (value.edit === undefined ||
        value.edit === null ||
        (typeof value.edit.id === "string" &&
          typeof value.edit.sourceUserEntryId === "string" &&
          (value.edit.expectedLeafId === null || typeof value.edit.expectedLeafId === "string") &&
          Number.isSafeInteger(value.edit.expectedRevision) &&
          value.edit.expectedRevision >= 0 &&
          typeof value.edit.ordinaryText === "string" &&
          isAttachmentReferences(value.edit.ordinaryAttachments) &&
          Number.isSafeInteger(value.edit.imageCount) &&
          value.edit.imageCount >= 0))
    ) {
      return { ...value, edit: value.edit ?? null };
    }
  } catch {
    // Earlier drafts store literal text instead of a JSON document.
  }
  const migrated = { ...empty, text: stored };
  saveDraft(chatId, migrated);
  return migrated;
}

/** Keeps an unsent draft on this device and forgets it once it is empty. */
export function saveDraft(chatId: string | null, draft: ChatDraft): void {
  if (chatId === null) {
    return;
  }
  if (draft.text === "" && draft.attachments.length === 0 && draft.edit === null) {
    localStorage.removeItem(storagePrefix + chatId);
  } else {
    localStorage.setItem(storagePrefix + chatId, JSON.stringify(draft));
  }
}

/** Returns retained sources for the active edit or the ordinary draft. */
export function readDraftAttachments(chatId: string, editId?: string): DraftAttachmentReference[] {
  const draft = readDraft(chatId);
  if (draft.edit?.id === editId) {
    return draft.attachments;
  }
  return editId === undefined ? (draft.edit?.ordinaryAttachments ?? draft.attachments) : [];
}

/** Saves sources without replacing text or another edit's attachment references. */
export function saveDraftAttachments(
  chatId: string,
  attachments: DraftAttachmentReference[],
  editId?: string,
): void {
  const draft = readDraft(chatId);
  if (draft.edit?.id === editId) {
    saveDraft(chatId, { ...draft, attachments });
  } else if (editId === undefined && draft.edit !== null) {
    saveDraft(chatId, { ...draft, edit: { ...draft.edit, ordinaryAttachments: attachments } });
  }
}

function isAttachmentReferences(value: unknown): value is DraftAttachmentReference[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry?.summary?.id === "string" &&
        typeof entry.summary.name === "string" &&
        typeof entry.isFile === "boolean",
    )
  );
}
