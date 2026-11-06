import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { ChatEvent, ChatState } from "./api-types.ts";
import type { Chat, OpenChat } from "./create-chat.ts";
import { createOperations, type Operations } from "./create-operations.ts";
import type { Operation, OperationResult } from "./headless-types.ts";
import { operationExitCode } from "./operation-exit-code.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const parent = createTestFolder("operations");
let nextCase = 0;

function setup() {
  const directory = join(parent, String(nextCase++));
  const state: ChatState = {
    id: "chat-one",
    folder: "project",
    model: { providerId: "faux", id: "model" },
    thinking: null,
    messages: [],
    reply: [],
    toolRuns: {},
    leafId: null,
    whileReplying: "queue",
    compactionError: null,
    contextVersion: 0,
    backgroundCommands: [],
    isReplying: false,
    isCompacting: false,
    pending: { revision: 0, isPaused: false, items: [], error: null },
  };
  const inputStates = new Map<string, string>();
  const listeners = new Set<(event: ChatEvent) => void>();
  let result: OperationResult = { status: "completed", finalEntryId: null };
  const opened = {
    compose: (text: string) => ({ id: "preview-one", kind: "literal", text }),
    getState: () => state,
    close: vi.fn(),
    entryText: () => "Only the final answer.",
    outcome: () => result,
    inputState: (id: string) => inputStates.get(id),
    subscribe(listener: (event: ChatEvent) => void) {
      listeners.add(listener);
      listener({ type: "state", state });
      return () => listeners.delete(listener);
    },
    send: vi.fn<OpenChat["send"]>(
      async (_text, _interpretation, _previewId, _hasBrowserApprovals, _options, submission) => {
        handoff(submission?.submissionId ?? "");
        emit({ type: "replying", isReplying: true });
        return true;
      },
    ),
    stop: vi.fn(),
  } as unknown as OpenChat;
  const chat = {
    open: vi.fn(async () => opened),
    create: vi.fn(async () => "chat-one"),
  } as unknown as Chat;
  const operations = createOperations(chat, directory, "server-one");
  function emit(event: ChatEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }
  function settle(status: OperationResult["status"] = "completed"): void {
    result = { status, finalEntryId: "entry-one" };
    emit({ type: "replying", isReplying: false });
  }
  function handoff(id: string): void {
    inputStates.set(id, "handingOff");
    emit({ type: "pending", chatId: state.id, leafId: null, pending: state.pending });
  }
  return { directory, state, chat, opened, operations, emit, settle, handoff };
}

test("acceptance precedes submission and a fast settlement remains waitable", async () => {
  const fixture = setup();
  vi.mocked(fixture.opened.send).mockImplementation(
    async (_text, _interpretation, _previewId, _hasBrowserApprovals, _options, submission) => {
      expect(readFileSync(join(fixture.directory, "operations.jsonl"), "utf8")).toContain(
        '"type":"accepted"',
      );
      fixture.handoff(submission?.submissionId ?? "");
      fixture.emit({ type: "replying", isReplying: true });
      fixture.settle();
      return true;
    },
  );
  const receipt = await fixture.operations.prompt({
    requestId: "one",
    text: "Exact task.\n",
    project: "project",
    isLiteral: true,
  });
  expect(await fixture.operations.wait(receipt.operationId, "fail")).toMatchObject({
    status: "completed",
    text: "Only the final answer.",
  });
  expect(fixture.opened.send).toHaveBeenCalledWith(
    "Exact task.\n",
    "literal",
    undefined,
    false,
    undefined,
    {
      operationId: receipt.operationId,
      submissionId: receipt.submissionId,
    },
  );
  const journal = readFileSync(join(fixture.directory, "operations.jsonl"), "utf8");
  expect(journal).not.toContain("Exact task");
  expect(journal).not.toContain("Only the final answer");
});

test("a repeated request shares its operation and different arguments conflict", async () => {
  const { operations, opened } = setup();
  const input = { requestId: "same", text: "Task.", chatId: "chat-one" };
  const [first, second] = await Promise.all([operations.prompt(input), operations.prompt(input)]);
  expect(second.operationId).toBe(first.operationId);
  expect(opened.send).toHaveBeenCalledTimes(1);
  await expect(operations.prompt({ ...input, text: "Other task." })).rejects.toMatchObject({
    exitCode: 6,
  });
  operations.close();
});

test("a concurrent browser reply cannot settle a submission before it starts", async () => {
  const { opened, operations, emit, settle, handoff, state } = setup();
  state.isReplying = true;
  vi.mocked(opened.send).mockImplementation(
    async (_text, _interpretation, _previewId, _hasBrowserApprovals, _options, submission) => {
      emit({ type: "replying", isReplying: true });
      settle();
      handoff(submission?.submissionId ?? "");
      return true;
    },
  );
  const receipt = await operations.prompt({ requestId: "one", text: "Task.", chatId: "chat-one" });
  expect(receipt.status).toBe("running");
  await expectCompletion(operations, receipt.operationId, settle);
});

test("waiting stays silent until settlement and ignores intermediate messages", async () => {
  const { operations, emit, settle } = setup();
  const receipt = await operations.prompt({ requestId: "one", text: "Task.", chatId: "chat-one" });
  let hasFinished = false;
  const waiting = operations.wait(receipt.operationId, "fail").then((value) => {
    hasFinished = true;
    return value;
  });
  emit({ type: "replyPart", index: 0, part: { type: "text", text: "Intermediate." } });
  await Promise.resolve();
  expect(hasFinished).toBe(false);
  settle();
  expect((await waiting).status).toBe("completed");
});

test("an observer deadline or interruption detaches without stopping the agent", async () => {
  const { operations, opened, settle } = setup();
  const receipt = await operations.prompt({ requestId: "one", text: "Task.", chatId: "chat-one" });
  expect((await operations.wait(receipt.operationId, "fail", undefined, 1)).status).toBe("running");
  const controller = new AbortController();
  const waiting = operations.wait(receipt.operationId, "fail", controller.signal);
  controller.abort();
  await expect(waiting).rejects.toMatchObject({ exitCode: 130 });
  expect(opened.stop).not.toHaveBeenCalled();
  await expectCompletion(operations, receipt.operationId, settle);
});

async function expectCompletion(
  operations: Operations,
  id: string,
  settle: () => void,
): Promise<void> {
  settle();
  expect((await operations.show(id)).status).toBe("completed");
}

test("headless approval required detaches immediately and remains visible after settlement", async () => {
  const { operations, emit, settle, opened } = setup();
  const receipt = await operations.prompt({ requestId: "one", text: "Task.", chatId: "chat-one" });
  const waiting = operations.wait(receipt.operationId, "fail");
  emit({
    type: "toolResult",
    id: "call-one",
    result: {
      text: "Approval required.",
      images: [],
      isError: true,
      details: { outcome: "approvalRequired" },
    },
  });
  expect(await waiting).toMatchObject({
    status: "running",
    code: "approvalRequired",
    toolCallId: "call-one",
  });
  expect(vi.mocked(opened.send).mock.calls[0]?.[3]).toBe(false);
  settle();
  expect(operationExitCode((await operations.show(receipt.operationId)) as Operation)).toBe(7);
});

test("explicit question waiting uses browser approval delivery and waits for settlement", async () => {
  const { operations, emit, settle, opened } = setup();
  const receipt = await operations.prompt({
    requestId: "one",
    text: "Task.",
    chatId: "chat-one",
    onQuestion: "wait",
  });
  emit({ type: "toolProgress", id: "call-one", details: { approval: { id: "question-one" } } });
  expect(await operations.wait(receipt.operationId, "fail")).toMatchObject({
    status: "waitingForInput",
    questionId: "question-one",
  });
  let hasFinished = false;
  const waiting = operations.wait(receipt.operationId, "wait").then((value) => {
    hasFinished = true;
    return value;
  });
  await Promise.resolve();
  expect(hasFinished).toBe(false);
  expect(vi.mocked(opened.send).mock.calls[0]?.[3]).toBe(true);
  settle();
  expect(await waiting).toMatchObject({ status: "completed" });
  expect(await operations.show(receipt.operationId)).not.toHaveProperty("questionId");
});

test.each([
  ["cancelled", 9],
  ["outputLimited", 10],
] as const)(
  "terminal %s takes precedence over an earlier unmet approval",
  async (status, expected) => {
    const { operations, settle, emit } = setup();
    const receipt = await operations.prompt({
      requestId: "precedence",
      text: "Task.",
      chatId: "chat-one",
    });
    emit({ type: "toolProgress", id: "call-one", details: { outcome: "approvalRequired" } });
    settle(status);
    expect(operationExitCode(await operations.show(receipt.operationId))).toBe(expected);
  },
);

test("restart preserves terminal output references and never resubmits unfinished work", async () => {
  const { operations, chat, directory, settle, opened } = setup();
  const first = await operations.prompt({ requestId: "one", text: "First.", chatId: "chat-one" });
  settle();
  const second = await operations.prompt({ requestId: "two", text: "Second.", chatId: "chat-one" });
  operations.close();
  const resumed = createOperations(chat, directory, "server-two");
  expect(await resumed.show(first.operationId)).toMatchObject({
    status: "completed",
    text: "Only the final answer.",
  });
  expect(await resumed.show(second.operationId)).toMatchObject({
    status: "interrupted",
    code: "serverRestarted",
  });
  await resumed.prompt({ requestId: "two", text: "Second.", chatId: "chat-one" });
  expect(opened.send).toHaveBeenCalledTimes(2);
  resumed.close();
});

test("a partial final journal write is discarded before interrupted records are appended", async () => {
  const { operations, directory, chat } = setup();
  const receipt = await operations.prompt({ requestId: "one", text: "Task.", chatId: "chat-one" });
  operations.close();
  const path = join(directory, "operations.jsonl");
  writeFileSync(path, `${readFileSync(path, "utf8")}{"partial":`);
  const resumed = createOperations(chat, directory, "next");
  expect((await resumed.show(receipt.operationId)).status).toBe("interrupted");
  expect(
    readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .every((line) => JSON.parse(line)),
  ).toBe(true);
});

test("compacting and model-less chats reject before acceptance", async () => {
  const { operations, state, opened } = setup();
  state.isCompacting = true;
  await expect(
    operations.prompt({ requestId: "one", text: "Task.", chatId: "chat-one" }),
  ).rejects.toMatchObject({ exitCode: 6 });
  state.isCompacting = false;
  state.model = null;
  await expect(
    operations.prompt({ requestId: "two", text: "Task.", chatId: "chat-one" }),
  ).rejects.toMatchObject({ exitCode: 6 });
  expect(opened.send).not.toHaveBeenCalled();
});

test.each([
  ["completed", 0],
  ["failed", 1],
  ["interrupted", 5],
  ["cancelled", 9],
  ["outputLimited", 10],
] as const)("settled %s maps to exit code %i", async (status, code) => {
  const { operations, settle } = setup();
  const receipt = await operations.prompt({ requestId: "one", text: "Task.", chatId: "chat-one" });
  settle(status);
  expect(operationExitCode((await operations.show(receipt.operationId)) as Operation)).toBe(code);
});

test("unknown operations and missing chats return precise missing object errors", async () => {
  const { operations, chat } = setup();
  await expect(operations.show("missing")).rejects.toMatchObject({ exitCode: 3 });
  vi.mocked(chat.open).mockResolvedValue(undefined);
  await expect(
    operations.prompt({ requestId: "one", text: "Task.", chatId: "missing" }),
  ).rejects.toMatchObject({ exitCode: 3 });
});
