import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { checkBranchBoundary, createConversationBranches } from "./create-conversation-branches.ts";

test("edits and retries keep creation order and restore the last visited descendants", () => {
  const manager = SessionManager.inMemory();
  manager.appendModelChange("faux", "model");
  manager.appendThinkingLevelChange("low");
  const first = manager.appendMessage({ role: "user", content: "Original", timestamp: 1 });
  manager.appendMessage(fauxAssistantMessage("First reply"));
  const descendant = manager.appendMessage({ role: "user", content: "Later", timestamp: 2 });
  const end = manager.appendMessage(fauxAssistantMessage("Later reply"));
  const parent = manager.getEntry(first)?.parentId;
  if (parent == null) {
    throw new Error("The prompt needs a parent.");
  }
  manager.branch(parent);
  manager.appendCustomEntry("independum-input", {
    text: "Original",
    branch: { kind: "retry", sourceUserEntryId: first },
  });
  const retry = manager.appendMessage({ role: "user", content: "Original", timestamp: 3 });
  const retryEnd = manager.appendMessage(fauxAssistantMessage("Second reply"));
  manager.branch(parent);
  manager.appendCustomEntry("independum-input", {
    text: "Edited",
    branch: { kind: "edit", sourceUserEntryId: retry },
  });
  const edit = manager.appendMessage({ role: "user", content: "Edited", timestamp: 4 });
  manager.appendMessage(fauxAssistantMessage("Edited reply"));
  const branches = createConversationBranches(manager);
  expect(branches.summaries()[edit]).toEqual({
    prompt: { selected: 2, count: 2 },
    reply: { selected: 1, count: 1 },
  });
  expect(branches.choices(first, "reply").map((choice) => choice.id)).toEqual([first, retry]);
  expect(branches.target(edit, first, "prompt")).toBe(retryEnd);
  expect(branches.target(retry, first, "reply")).toBe(end);
  manager.branch(end);
  const selection = manager.appendCustomEntry("independum-branch-selection", {
    version: 1,
    targetLeafId: end,
  });
  expect(branches.target(edit, first, "prompt")).toBe(selection);
  expect(branches.summaries()[first]).toEqual({
    prompt: { selected: 1, count: 2 },
    reply: { selected: 1, count: 2 },
  });
  expect(branches.summaries()[descendant]?.prompt.count).toBe(1);
  expect(branches.choices(edit, "prompt").map((choice) => choice.id)).toEqual([first, edit]);
  expect(() => branches.target(edit, descendant, "prompt")).toThrow("does not belong");
});

test("identical and image-only prompts keep stable identities and original image bytes", () => {
  const manager = SessionManager.inMemory();
  const image = { type: "image", data: "original", mimeType: "image/png" } as const;
  const first = manager.appendMessage({ role: "user", content: [image], timestamp: 1 });
  const second = manager.appendMessage({ role: "user", content: [image], timestamp: 1 });
  const branches = createConversationBranches(manager);
  expect(branches.source(first)).toMatchObject({
    id: first,
    text: "",
    images: [image],
    model: null,
  });
  expect(branches.source(second).groupId).toBe(second);
  expect(branches.choices(first, "prompt")).toHaveLength(1);
  expect(() => branches.source("missing")).toThrow("does not exist");
});

test("tool boundaries require matching calls and results", () => {
  const manager = SessionManager.inMemory();
  manager.appendMessage(
    fauxAssistantMessage([fauxToolCall("Read", { path: "file" }, { id: "call" })], {
      stopReason: "toolUse",
    }),
  );
  expect(() => checkBranchBoundary(manager.getBranch())).toThrow("without its result");
  manager.appendMessage({
    role: "toolResult",
    toolCallId: "call",
    toolName: "Read",
    content: [{ type: "text", text: "Read." }],
    isError: false,
    timestamp: 1,
  });
  expect(() => checkBranchBoundary(manager.getBranch())).not.toThrow();
  manager.appendMessage({
    role: "toolResult",
    toolCallId: "orphan",
    toolName: "Read",
    content: [],
    isError: false,
    timestamp: 1,
  });
  expect(() => checkBranchBoundary(manager.getBranch())).toThrow("without its call");
});
