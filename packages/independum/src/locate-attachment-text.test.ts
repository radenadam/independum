import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fauxProvider } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { createAttachments } from "./create-attachments.ts";
import { locateAttachmentText } from "./locate-attachment-text.ts";
import { createModelTexts } from "./model-texts.ts";
import { builtInAttachments } from "./read-attachment-settings.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const parent = createTestFolder("attachment-text-location");

test("captured locators find exact text after hooks and legacy offsets require unchanged input", async () => {
  const store = createAttachments(join(parent, "attachments"));
  const chatId = randomUUID();
  const source = await store.upload(
    chatId,
    "file.pdf",
    "application/pdf",
    new Response("%PDF-fixture").body,
    builtInAttachments.maxFileBytes,
  );
  const prepared = await store.prepare(
    "Prompt.",
    [source.id],
    [],
    chatId,
    builtInAttachments,
    createModelTexts(() => ({})),
    fauxProvider().getModel(),
  );
  const position = prepared.positions[0];
  if (position === undefined) {
    throw new Error("The attachment position is missing.");
  }
  const expected = prepared.text.slice(position.start, position.end);
  const changed = `${expected.slice(0, -1)}!`;
  expect(locateAttachmentText(prepared.text, position)).toBe(expected);
  expect(locateAttachmentText(`${"x".repeat(580)}${prepared.text}`, position)).toBe(expected);
  expect(locateAttachmentText(`${changed}\n${expected}`, position)).toBe(expected);
  expect(locateAttachmentText(`${expected}\n${expected}`, position)).toBe(expected);
  expect(locateAttachmentText(changed, position)).toBeNull();
  expect(locateAttachmentText("Removed by hook.", position)).toBeNull();
  const { textPrefix: _prefix, textHash: _hash, ...legacy } = position;
  expect(locateAttachmentText(prepared.text, legacy, prepared.text)).toBe(expected);
  expect(locateAttachmentText(`Hook prefix.${prepared.text}`, legacy, prepared.text)).toBeNull();
  expect(locateAttachmentText(changed, legacy, prepared.text)).toBeNull();
  expect(locateAttachmentText(prepared.text, legacy, undefined)).toBeNull();
  expect(
    locateAttachmentText(
      prepared.text,
      { ...legacy, end: prepared.text.length + 1 },
      prepared.text,
    ),
  ).toBeNull();
  expect(
    locateAttachmentText(prepared.text, { ...legacy, textPrefix: _prefix ?? "" }, prepared.text),
  ).toBeNull();
  expect(locateAttachmentText(prepared.text, { ...position, start: -1 })).toBeNull();
  const empty = await store.prepare(
    "Prompt.",
    [source.id],
    [],
    chatId,
    { ...builtInAttachments, includeDetails: false },
    createModelTexts(() => ({})),
    fauxProvider().getModel(),
  );
  expect(locateAttachmentText("Hook input.", empty.positions[0] ?? legacy)).toBe("");
});
