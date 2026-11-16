import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { createSavedChats } from "./create-saved-chats.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

vi.mock("node:fs/promises", { spy: true });

const folder = createTestFolder("pins");

test("overlapping pins survive a restart after an older save finishes late", async () => {
  const path = join(folder, "pinned-chats.json");
  const chats = await createSavedChats(folder, path);
  const original = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  const writes: Promise<void>[] = [];
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const before = vi.mocked(writeFile).mock.calls.length;
  vi.mocked(writeFile).mockImplementationOnce(async (file, data, options) => {
    started.resolve();
    await release.promise;
    await original.writeFile(file, data, options);
  });
  writes.push(chats.pin("first", true));
  await started.promise;
  writes.push(chats.pin("second", true), chats.pin("first", false));
  try {
    expect(vi.mocked(writeFile).mock.calls.slice(before)).toHaveLength(1);
  } finally {
    release.resolve();
    await Promise.all(writes);
  }
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(["second"]);
  const restarted = await createSavedChats(folder, path);
  expect(restarted.isPinned("first")).toBe(false);
  expect(restarted.isPinned("second")).toBe(true);
});

test("a saved chat takes its title line from what the user wrote in its first prompt", async () => {
  const sessions = join(folder, "sessions");
  const note =
    '<independum source="attachment 1">\nName: "notes.txt"\nPath: "/state/attachments/id/content"\n</independum>';
  function save(input: object | undefined, content: string): string {
    const manager = SessionManager.create(folder, sessions);
    if (input !== undefined) {
      manager.appendCustomEntry("independum-input", input);
    }
    manager.appendMessage({ role: "user", content, timestamp: Date.now() });
    return manager.getSessionId();
  }
  const text = "\n  Summarize this.  \nThen list the open questions.";
  const written = save(
    { version: 1, text, attachments: [{ name: "notes.txt" }] },
    `${text}\n\n${note}`,
  );
  const attached = save(
    { version: 1, text: " ", attachments: [{ name: "notes.txt" }, { name: "pixel.png" }] },
    note,
  );
  const legacy = save(undefined, "Written before input entries.\nWith a second line.");
  const chats = await createSavedChats(sessions, join(folder, "titled-pins.json"));
  const titles = new Map((await chats.list()).map((chat) => [chat.id, chat.promptTitle]));
  expect(titles).toEqual(
    new Map([
      [written, "Summarize this."],
      [attached, "notes.txt, pixel.png"],
      [legacy, "Written before input entries."],
    ]),
  );
});
