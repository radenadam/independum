import { type FileHandle, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  parseSessionEntries,
  type SessionInfo,
  SessionManager,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { isMissingFile } from "./is-missing-file.ts";
import { titleOfPrompt } from "./title-of-prompt.ts";

/** A chat that Pi saved, with the whole line that its first prompt gives it as a title. */
export interface SavedChat extends SessionInfo {
  promptTitle: string;
}

/** The saved chats of a session folder, with the archived ones apart and the pinned ones marked. */
export interface SavedChats {
  list(): Promise<SavedChat[]>;
  listArchived(): Promise<SavedChat[]>;
  isPinned(id: string): boolean;
  pin(id: string, isPinned: boolean): Promise<void>;
  archive(saved: SessionInfo): Promise<void>;
  unarchive(saved: SessionInfo): Promise<void>;
  remove(saved: SessionInfo): Promise<void>;
}

/**
 * Opens the saved chats of a session folder, which keeps archived chats in its `archived` folder
 * and the ids of pinned chats in a file of their own.
 */
export async function createSavedChats(
  sessionDirectory: string,
  pinnedFile: string,
): Promise<SavedChats> {
  // Pi lists only the chats at the top of a folder, so a chat in the archive folder drops out of
  // every list, and the file keeps its name and its messages.
  const archiveDirectory = join(sessionDirectory, "archived");
  const pinned = new Set(await readPinned(pinnedFile));
  // Pi only appends to a chat file, so the title of its first prompt stays once it is read. A null
  // title stands for a first prompt from before input entries, which takes its line from Pi.
  const promptTitles = new Map<string, string | null>();

  async function withTitles(chats: SessionInfo[]): Promise<SavedChat[]> {
    const titled: SavedChat[] = [];
    for (const chat of chats) {
      let title = promptTitles.get(chat.path);
      if (title === undefined) {
        title = await readPromptTitle(chat.path);
        if (title !== undefined) {
          promptTitles.set(chat.path, title);
        }
      }
      titled.push({ ...chat, promptTitle: title ?? titleOfPrompt(chat.firstMessage, []) });
    }
    return titled;
  }

  async function setPinned(id: string, isPinned: boolean): Promise<void> {
    const wasPinned = pinned.has(id);
    if (isPinned) {
      pinned.add(id);
    } else {
      pinned.delete(id);
    }
    if (wasPinned !== isPinned) {
      await withFileMutationQueue(pinnedFile, () =>
        writeFile(pinnedFile, `${JSON.stringify([...pinned], null, 2)}\n`),
      );
    }
  }

  return {
    list: async () => withTitles(await SessionManager.listAll(sessionDirectory)),
    listArchived: async () => withTitles(await SessionManager.listAll(archiveDirectory)),
    isPinned: (id) => pinned.has(id),
    pin: setPinned,
    async archive(saved) {
      await mkdir(archiveDirectory, { recursive: true });
      await rename(saved.path, join(archiveDirectory, basename(saved.path)));
      await setPinned(saved.id, false);
    },
    async unarchive(saved) {
      await rename(saved.path, join(sessionDirectory, basename(saved.path)));
    },
    async remove(saved) {
      await rm(saved.path);
      await setPinned(saved.id, false);
    },
  };
}

// Pi titles a chat by the text of its first user message, which also holds the notes that
// Independum adds for attachments. The input entry before that message holds what the user wrote.
// A message without an input entry gives null, and undefined means that no message decides yet.
async function readPromptTitle(path: string): Promise<string | null | undefined> {
  let file: FileHandle;
  try {
    file = await open(path);
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
  try {
    let input: { text?: unknown; attachments?: { name: string }[] } | undefined;
    for await (const line of file.readLines({ encoding: "utf8" })) {
      const [entry] = parseSessionEntries(line);
      if (entry?.type === "custom" && entry.customType === "independum-input") {
        input = entry.data as typeof input;
      } else if (entry?.type === "message" && entry.message.role === "user") {
        if (typeof input?.text !== "string") {
          return null;
        }
        const title = titleOfPrompt(input.text, input.attachments ?? []);
        if (title !== "") {
          return title;
        }
        input = undefined;
      }
    }
    return undefined;
  } finally {
    await file.close();
  }
}

async function readPinned(pinnedFile: string): Promise<string[]> {
  const text = await readFile(pinnedFile, "utf8").catch(() => "[]");
  const parsed: unknown = JSON.parse(text);
  return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
}
