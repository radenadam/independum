import { readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The last request of each chat, kept in a file of its own beside the chats of Pi. */
export interface SavedRequests {
  pathOf: (chatId: string) => string;
  read: (chatId: string) => unknown;
  save: (chatId: string, request: unknown) => Promise<void>;
  remove: (chatId: string) => void;
}

// Pi does not save requests, only the messages that they hold.
/**
 * Keeps the last request of each chat in a folder, so a chat shows what it sent last when it
 * opens again.
 */
export function createSavedRequests(folder: string): SavedRequests {
  function fileOf(chatId: string): string {
    return join(folder, `${chatId}.json`);
  }
  return {
    pathOf: fileOf,
    read(chatId) {
      try {
        return JSON.parse(readFileSync(fileOf(chatId), "utf8"));
      } catch {
        return null;
      }
    },
    // A request that is not saved only means that the chat shows its next request when it opens
    // again, so a failed write stays quiet.
    async save(chatId, request) {
      await mkdir(folder, { recursive: true })
        .then(() => writeFile(fileOf(chatId), JSON.stringify(request)))
        .catch(() => undefined);
    },
    remove(chatId) {
      rmSync(fileOf(chatId), { force: true });
    },
  };
}
