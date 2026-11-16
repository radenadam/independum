import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { createSavedChats } from "./create-saved-chats.ts";
import { holdFile } from "./hold-file.ts";
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

test("archiving moves a chat once a scan that held its file lets go", async (context) => {
  const sessions = join(folder, "held-sessions");
  mkdirSync(sessions, { recursive: true });
  const path = join(sessions, "held.jsonl");
  writeFileSync(path, "{}\n");
  const chats = await createSavedChats(sessions, join(folder, "held-pins.json"));
  const release = holdFile(path);
  context.onTestFinished(release);
  const original = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(rename).mockImplementationOnce(async (source, target) => {
    try {
      await original.rename(source, target);
    } finally {
      release();
    }
  });
  await chats.archive({ id: "held", path } as SessionInfo);
  expect(existsSync(path)).toBe(false);
  expect(readFileSync(join(sessions, "archived", "held.jsonl"), "utf8")).toBe("{}\n");
});
