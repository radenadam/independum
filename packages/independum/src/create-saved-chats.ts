import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { type SessionInfo, SessionManager } from "@earendil-works/pi-coding-agent";

/** The saved chats of a session folder, with the archived ones apart and the pinned ones marked. */
export interface SavedChats {
  list(): Promise<SessionInfo[]>;
  listArchived(): Promise<SessionInfo[]>;
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

  async function setPinned(id: string, isPinned: boolean): Promise<void> {
    const wasPinned = pinned.has(id);
    if (isPinned) {
      pinned.add(id);
    } else {
      pinned.delete(id);
    }
    if (wasPinned !== isPinned) {
      await writeFile(pinnedFile, `${JSON.stringify([...pinned], null, 2)}\n`);
    }
  }

  return {
    list: () => SessionManager.listAll(sessionDirectory),
    listArchived: () => SessionManager.listAll(archiveDirectory),
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

async function readPinned(pinnedFile: string): Promise<string[]> {
  const text = await readFile(pinnedFile, "utf8").catch(() => "[]");
  const parsed: unknown = JSON.parse(text);
  return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
}
