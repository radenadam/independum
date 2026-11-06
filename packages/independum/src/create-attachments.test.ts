import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fauxProvider } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { attachmentTexts } from "./attachment-texts.ts";
import { createAttachments } from "./create-attachments.ts";
import { createModelTexts } from "./model-texts.ts";
import { builtInAttachments, readAttachmentSettings } from "./read-attachment-settings.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const directory = createTestFolder("attachments");
const store = createAttachments(join(directory, "sources"));
const chatId = randomUUID();
const texts = createModelTexts(() => ({}));
const model = fauxProvider({ models: [{ id: "vision", input: ["text", "image"] }] }).getModel();
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function upload(bytes: Buffer, name = "notes.txt", mimeType = "text/plain") {
  return store.upload(
    chatId,
    name,
    mimeType,
    new Response(new Uint8Array(bytes)).body,
    builtInAttachments.maxFileBytes,
  );
}

test("strict text decoding preserves original bytes and line endings", async () => {
  for (const bytes of [
    Buffer.from("first\r\nsecond\n"),
    Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("first\r\nsecond\n")]),
    Buffer.from([0xff, 0xfe, ...Buffer.from("first\r\nsecond\n", "utf16le")]),
    Buffer.from([0xfe, 0xff, ...Buffer.from("first\r\nsecond\n", "utf16le").swap16()]),
  ]) {
    const source = await upload(bytes);
    expect(source.kind).toBe("text");
    expect(store.source(source.id, chatId).bytes).toEqual(bytes);
    const prepared = await store.prepare(
      "",
      [source.id],
      [],
      chatId,
      builtInAttachments,
      texts,
      model,
    );
    expect(prepared.text).toContain("first\r\nsecond\n");
    expect(source.textBytes).toBe(Buffer.byteLength("first\r\nsecond\n"));
  }
});

test("invalid text and binary documents remain files even with advisory text media types", async () => {
  for (const bytes of [
    Buffer.from([0xc3, 0x28]),
    Buffer.from([0xff, 0xfe, 0x00]),
    Buffer.from([0xfe, 0xff, 0xd8, 0x00]),
    Buffer.from("%PDF-1.7\nASCII PDF"),
    Buffer.from([0, 1, 2]),
    Buffer.from("PK\u0003\u0004archive"),
  ]) {
    const source = await upload(bytes);
    expect(source).toMatchObject({ kind: "file", encoding: null });
    expect(
      (await store.preview(source.id, chatId, false, builtInAttachments, texts, model)).modelText,
    ).toContain("Path:");
  }
  expect((await upload(Buffer.from("<svg/>"), "drawing.svg", "image/svg+xml")).kind).toBe("file");
});

test("streamed uploads stop at the exact byte limit and preserve no partial source", async () => {
  let isCancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(5));
    },
    cancel() {
      isCancelled = true;
    },
  });
  await expect(
    store.upload(chatId, "too-large", "application/octet-stream", body, 9),
  ).rejects.toMatchObject({ status: 413, code: "attachmentTooLarge" });
  expect(isCancelled).toBe(true);
  const exact = await store.upload(
    chatId,
    "exact",
    "application/octet-stream",
    new Response(new Uint8Array(9)).body,
    9,
  );
  expect(exact.bytes).toBe(9);
});

test("names cannot select paths and sources are scoped to their chat", async () => {
  for (const name of ["../notes", "folder\\notes", "a\nname", "..", "a".repeat(256)]) {
    await expect(upload(Buffer.from("text"), name)).rejects.toMatchObject({ status: 400 });
  }
  const source = await upload(Buffer.from("text"), 'quoted "file".txt');
  const prepared = await store.prepare(
    "Prompt",
    [source.id],
    [],
    chatId,
    builtInAttachments,
    texts,
    model,
  );
  expect(prepared.text).toContain('Name: "quoted \\"file\\".txt"');
  expect(() => store.source(source.id, randomUUID())).toThrow("does not belong");
  expect(() => store.source("../content", chatId)).toThrow("id is invalid");
  expect(store.source(source.id, "fork", [source.id]).bytes.toString()).toBe("text");
});

test("text and source totals block sending until an explicit file path choice", async () => {
  const first = await upload(Buffer.from("abc"));
  const second = await upload(Buffer.from("def"));
  const settings = { ...builtInAttachments, maxTextBytes: 2, maxTotalTextBytes: 4 };
  expect(() => store.validate([first.id], [], chatId, settings)).toThrow("inline text limits");
  expect(store.validate([first.id], [first.id], chatId, settings)).toHaveLength(1);
  expect(() =>
    store.validate([first.id, second.id], [], chatId, { ...settings, maxTextBytes: 3 }),
  ).toThrow("inline text limits");
  expect(() =>
    store.validate([first.id, second.id], [], chatId, { ...builtInAttachments, maxCount: 1 }),
  ).toThrow("count or original byte");
  expect(() =>
    store.validate([first.id, second.id], [], chatId, { ...builtInAttachments, maxTotalBytes: 5 }),
  ).toThrow("count or original byte");
  expect(() => store.validate([first.id, first.id], [], chatId, builtInAttachments)).toThrow(
    "unique",
  );
  expect(() => store.validate([first.id], [second.id], chatId, builtInAttachments)).toThrow(
    "file path choices",
  );
});

test("attachment facts and the shared envelope use editable model texts", async () => {
  const source = await upload(Buffer.from("text"));
  const edited = createModelTexts(() => ({
    "attachment.details": { text: "Saved {name}", builtIn: attachmentTexts.details.builtIn },
    "note.envelope": { text: "[{source}] {note}", builtIn: "" },
  }));
  const prepared = await store.prepare(
    "",
    [source.id],
    [],
    chatId,
    builtInAttachments,
    edited,
    model,
  );
  expect(prepared.text).toBe('[attachment 1] Saved "notes.txt"\nText encoding: utf-8\ntext');
  const file = await upload(Buffer.from([0, 1]));
  const settings = { ...builtInAttachments, includeDetails: false };
  await expect(
    store.prepare("", [file.id], [], chatId, settings, texts, model),
  ).rejects.toMatchObject({ code: "emptyAttachmentInput" });
  expect((await store.prepare("", [source.id], [], chatId, settings, texts, model)).text).toBe(
    "text",
  );
});

test("images keep canonical pixels for models without image input and preparation failures block", async () => {
  const source = await upload(pixel, "pixel.png", "text/plain");
  expect(source).toMatchObject({ kind: "image", mimeType: "image/png" });
  const withoutImages = { ...model, input: ["text"] as "text"[] };
  const preview = await store.preview(
    source.id,
    chatId,
    false,
    builtInAttachments,
    texts,
    withoutImages,
  );
  expect(preview.notice).toContain("This model receives the image details, but not its pixels.");
  expect(preview.error).toBeNull();
  expect(preview.image).not.toBeNull();
  const prepared = await store.prepare(
    "",
    [source.id],
    [],
    chatId,
    { ...builtInAttachments, resizeImages: false },
    texts,
    withoutImages,
  );
  expect(prepared.images[0]?.data).toBe(pixel.toString("base64"));
  expect(store.source(source.id, chatId).bytes).toEqual(pixel);
  const second = await upload(pixel, "second.png", "image/png");
  await expect(
    store.prepare("Images", [source.id, second.id], [], chatId, builtInAttachments, texts, {
      ...model,
      inputLimits: { images: { maxPerMessage: 1 } },
    }),
  ).rejects.toMatchObject({ status: 413, code: "attachmentImageLimit" });
  const invalid = await upload(pixel.subarray(0, 20), "broken.png", "image/png");
  await expect(
    store.prepare("", [invalid.id], [], chatId, builtInAttachments, texts, model),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    store.prepare(
      "",
      [source.id],
      [],
      chatId,
      { ...builtInAttachments, includeDetails: false },
      texts,
      withoutImages,
    ),
  ).rejects.toMatchObject({ code: "emptyAttachmentInput" });
});

test("seven day cleanup retains references across chats and refuses malformed manifests", async () => {
  const keep = await upload(Buffer.from("retained"));
  const expire = await upload(Buffer.from("unsent"));
  store.expire(new Set([keep.id]), Date.now() + 7 * 24 * 60 * 60 * 1000);
  expect(store.source(keep.id, chatId).bytes.toString()).toBe("retained");
  expect(() => store.source(expire.id, chatId)).toThrow("Attach this file again");
  const brokenId = randomUUID();
  mkdirSync(join(directory, "sources", brokenId));
  writeFileSync(join(directory, "sources", brokenId, "manifest.json"), "{}");
  expect(() => store.expire(new Set(), Date.now())).toThrow("needs repair");
  expect(readFileSync(store.source(keep.id, chatId).path).toString()).toBe("retained");
});

test("attachment settings resolve defaults and reject unsafe or inconsistent limits", () => {
  expect(readAttachmentSettings({ maxCount: 3 })).toEqual({ ...builtInAttachments, maxCount: 3 });
  for (const settings of [
    { maxCount: 0 },
    { maxCount: 1.5 },
    { maxCount: Number.MAX_SAFE_INTEGER + 1 },
    { includeDetails: "false" },
    { surprise: true },
    { maxTotalBytes: 1 },
    { maxTotalTextBytes: 1 },
  ]) {
    expect(() => readAttachmentSettings(settings)).toThrow();
  }
});
