import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createModelTexts } from "../model-texts.ts";
import { createTestChat } from "./create-test-chat.ts";
import { createWriteTool } from "./create-write-tool.ts";

const chat = createTestChat("write");
const { folder } = chat;
const run = chat.run;
const place = chat.place;
const texts = createModelTexts(() => ({}));
const writeTool = createWriteTool(texts);

function write(path: string, content: string): ReturnType<typeof chat.run> {
  return run(writeTool, { path, content });
}

test("a new file is created with the folders it needs, exactly as the model sent it", async () => {
  expect(await write("new/deep/notes.txt", "one\r\ntwo\r\n")).toMatchObject({
    text: "Created new/deep/notes.txt with 2 lines.\nCreated the folder new.",
    isError: false,
    details: { isNew: true, added: 2 },
  });
  expect(readFileSync(join(folder, "new", "deep", "notes.txt"), "utf8")).toBe("one\r\ntwo\r\n");
  expect((await write("single.txt", "only")).text).toBe("Created single.txt with 1 line.");
});

test("replacing a file that the chat has not seen fails once, and the same call again works", async () => {
  const path = place("old.txt", "one\ntwo\nthree\n");
  expect(await write("old.txt", "new\n")).toMatchObject({
    text: "old.txt already exists, with 3 lines, and this chat has not seen it.",
    isError: true,
  });
  expect(readFileSync(path, "utf8")).toBe("one\ntwo\nthree\n");
  expect(await write("old.txt", "new\n")).toMatchObject({
    text: "Replaced old.txt, which now has 1 line.",
    isError: false,
    details: { isNew: false, added: 1, removed: 3 },
  });
  expect(readFileSync(path, "utf8")).toBe("new\n");
});

test("a file read before is replaced at once, with its line breaks, mark, and encoding", async () => {
  const windows = place(
    "windows.txt",
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("one\r\ntwo\r\n")]),
  );
  await chat.read({ path: "windows.txt", limit: 1 });
  expect((await write("windows.txt", "a\nb\nc\n")).text).toBe(
    "Replaced windows.txt, which now has 3 lines.",
  );
  expect(readFileSync(windows).toString("utf8")).toBe("\ufeffa\r\nb\r\nc\r\n");
  const utf16 = place("utf16.txt", Buffer.from([0xff, 0xfe, ...Buffer.from("one\n", "utf16le")]));
  await chat.read({ path: "utf16.txt" });
  await write("utf16.txt", "zwei\n");
  expect(readFileSync(utf16)).toEqual(
    Buffer.from([0xff, 0xfe, ...Buffer.from("zwei\n", "utf16le")]),
  );
});

test("a file that changed since the chat saw it is refused with the lines, then replaced", async () => {
  place("seen.txt", "one\ntwo\nthree\n");
  await chat.read({ path: "seen.txt" });
  place("seen.txt", "one\nTWO\nthree\n");
  expect(await write("seen.txt", "fresh\n")).toMatchObject({
    text: "seen.txt changed since this chat last saw it, at line 2, and now has 3 lines.",
    isError: true,
  });
  expect((await write("seen.txt", "fresh\n")).text).toBe(
    "Replaced seen.txt, which now has 1 line.",
  );
});

test("a folder and a binary file are named for what they are", async () => {
  mkdirSync(join(folder, "src"), { recursive: true });
  expect(await write("src", "text")).toMatchObject({
    text: "src is a folder, not a file.",
    isError: true,
  });
  place("font.bin", Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(100)]));
  expect((await write("font.bin", "text")).text).toBe(
    "font.bin already exists, with 104 bytes, and this chat has not seen it.",
  );
});
