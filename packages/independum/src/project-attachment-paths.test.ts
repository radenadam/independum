import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { projectAttachmentPaths, projectAttachmentText } from "./project-attachment-paths.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const parent = createTestFolder("attachment-path-projection");

test.each([false, true])(
  "only owned attachment ranges project exact paths in block form %s",
  (hasBlocks) => {
    const directory = join(parent, "custom-state");
    const id = randomUUID();
    const legacy = join(parent, "custom-state-attachments", id, "content");
    const current = join(directory, "attachments", id, "content");
    const path = JSON.stringify(legacy);
    const similar = JSON.stringify(join(parent, "custom-state-attachments-other", id, "content"));
    const text = `User text: ${path}\n`;
    const details = `Path: ${path}\nSimilar: ${similar}`;
    const manager = SessionManager.create(parent, join(parent, randomUUID()));
    manager.appendCustomEntry("independum-input", {
      version: 1,
      attachmentPositions: [
        {
          id,
          isFile: true,
          start: text.length,
          end: text.length + details.length,
          imageIndex: null,
        },
      ],
    });
    const content = hasBlocks
      ? [
          { type: "text" as const, text: text + details },
          { type: "image" as const, data: "fixture", mimeType: "image/png" },
        ]
      : text + details;
    manager.appendMessage({ role: "user", content, timestamp: 1000 });
    manager.appendMessage(fauxAssistantMessage(path));
    manager.appendMessage({ role: "user", content: details, timestamp: 2000 });
    const entries = manager.getEntries();
    const messages = entries.flatMap((entry) => (entry.type === "message" ? [entry.message] : []));
    const before = structuredClone(messages);
    const projected = projectAttachmentPaths(messages, entries, directory);
    const first = projected[0];
    expect(first?.role).toBe("user");
    if (first?.role !== "user") {
      throw new Error("The projected user message is missing.");
    }
    const expected = `${text}Path: ${JSON.stringify(current)}\nSimilar: ${similar}`;
    expect(
      typeof first.content === "string"
        ? first.content
        : first.content[0]?.type === "text"
          ? first.content[0].text
          : "",
    ).toBe(expected);
    expect(projected.slice(1)).toEqual(messages.slice(1));
    expect(messages).toEqual(before);
    expect(projectAttachmentPaths(projected, entries, directory)).toEqual(projected);
  },
);

test("the shown model text of an attachment maps its legacy store path like the request", () => {
  const state = join(parent, "state");
  const id = randomUUID();
  const legacy = JSON.stringify(join(`${state}-attachments`, id, "content"));
  const current = JSON.stringify(join(state, "attachments", id, "content"));
  expect(projectAttachmentText(`File ${legacy} is attached.`, id, state)).toBe(
    `File ${current} is attached.`,
  );
  expect(projectAttachmentText(`File ${legacy} is attached.`, randomUUID(), state)).toBe(
    `File ${legacy} is attached.`,
  );
});
