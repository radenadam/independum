const storagePrefix = "independum.draft.";

/** Returns the text that the user wrote in a chat and has not sent yet, on this device. */
export function readDraft(chatId: string | null): string {
  return chatId === null ? "" : (localStorage.getItem(storagePrefix + chatId) ?? "");
}

/** Keeps the unsent text of a chat on this device, and forgets it once it is empty. */
export function saveDraft(chatId: string | null, text: string): void {
  if (chatId === null) {
    return;
  }
  if (text === "") {
    localStorage.removeItem(storagePrefix + chatId);
  } else {
    localStorage.setItem(storagePrefix + chatId, text);
  }
}
