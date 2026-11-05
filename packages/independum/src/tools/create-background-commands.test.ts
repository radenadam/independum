import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { createModelTexts } from "../model-texts.ts";
import {
  type BackgroundCommands,
  type BackgroundEnded,
  createBackgroundCommands,
} from "./create-background-commands.ts";
import { createOutputLog } from "./create-output-log.ts";
import { createStopCommandTool } from "./create-stop-command-tool.ts";
import { createTestFolder } from "./create-test-folder.ts";
import type { RunEnd } from "./run-command.ts";

const folder = createTestFolder("background-ownership");
const texts = createModelTexts(() => ({}));

test("a chat cannot stop another chat's command or suppress its completion note", async () => {
  const ended: BackgroundEnded[] = [];
  const background = createBackgroundCommands({
    onProgress: () => undefined,
    onEnd: (end) => ended.push(end),
  });
  const controller = new AbortController();
  const running = Promise.withResolvers<RunEnd>();
  const outputPath = join(folder, "other-chat.log");
  const log = createOutputLog(outputPath, {
    limits: { maxLines: 2000, maxBytes: 51_200 },
    texts,
  });
  log.append("Private output.\n");
  const id = background.adopt({
    texts: createModelTexts(() => ({})),
    start: {
      toolCallId: "other-call",
      chatId: "other-chat",
      shell: { kind: "bash", name: "Bash", path: "bash" },
      command: "long command",
      outputPath,
    },
    startedAt: Date.now(),
    log,
    run: running.promise,
    controller,
  });
  const tool = createStopCommandTool(background, texts);
  const context = {
    sessionManager: { getSessionId: () => "old-chat" },
  } as unknown as Parameters<ToolDefinition["execute"]>[4];
  const attempt = tool.execute("stop-call", { id }, undefined, undefined, context);
  const rejection = expect(attempt).rejects.toThrow(
    `No background command with the id ${id} is running.`,
  );
  const wasStopped = controller.signal.aborted;
  running.resolve({
    ending: "exited",
    exitCode: 0,
    signal: null,
    isOutputOpen: false,
    durationMs: 10,
  });
  await rejection;
  await background.check("other-chat", id, { waitMs: 0, until: undefined, signal: undefined });
  await expect.poll(() => ended.length).toBe(1);
  expect(wasStopped).toBe(false);
  expect(ended[0]).toMatchObject({ chatId: "other-chat", isSeenByModel: false });
});

function adopt(commands: BackgroundCommands, chatId: string): AbortController {
  const controller = new AbortController();
  const outputPath = join(folder, `${chatId}.log`);
  const log = createOutputLog(outputPath, {
    limits: { maxLines: 10, maxBytes: 1000 },
    texts: createModelTexts(() => ({})),
  });
  const run = new Promise<RunEnd>((resolve) => {
    controller.signal.addEventListener("abort", () =>
      resolve({
        ending: "stopped",
        exitCode: null,
        signal: null,
        isOutputOpen: false,
        durationMs: 1,
      }),
    );
  });
  commands.adopt({
    texts: createModelTexts(() => ({})),
    start: {
      chatId,
      toolCallId: "same-call",
      shell: { kind: "bash", name: "Test shell", path: "unused" },
      command: "test",
      outputPath,
    },
    startedAt: Date.now(),
    log,
    run,
    controller,
  });
  return controller;
}

test("stopping a chat or a command uses the chat id even when call ids match", async () => {
  const ends: BackgroundEnded[] = [];
  const commands = createBackgroundCommands({
    onProgress: () => undefined,
    onEnd: (ended) => ends.push(ended),
  });
  const first = adopt(commands, "first");
  adopt(commands, "second");
  expect(commands.stopByUser("missing", "same-call")).toBe(false);
  expect(commands.stopByUser("second", "same-call")).toBe(true);
  await commands.stopAll("second");
  expect(ends.map((ended) => ended.chatId)).toEqual(["second"]);
  expect(first.signal.aborted).toBe(false);
  expect(commands.listRunning("first")).toHaveLength(1);
  expect(commands.listRunning("second")).toEqual([]);
  await commands.stopAll("first");
  expect(ends.map((ended) => ended.chatId)).toEqual(["second", "first"]);
  expect(commands.listRunning("first")).toEqual([]);
});
