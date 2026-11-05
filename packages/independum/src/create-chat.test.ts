import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  type AgentSession,
  createAgentSession,
  type ModelRuntime,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { createChat } from "./create-chat.ts";
import { createSavedChats, type SavedChats } from "./create-saved-chats.ts";
import { createShellTool } from "./tools/create-shell-tool.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";
import { type RunEnd, type RunOptions, runCommand } from "./tools/run-command.ts";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  class DefaultResourceLoader {
    async reload(): Promise<void> {}
  }
  return {
    ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
    createAgentSession: vi.fn(),
    // biome-ignore lint/style/useNamingConvention: Pi exports this class in PascalCase.
    DefaultResourceLoader,
  };
});
vi.mock("./create-saved-chats.ts", () => ({ createSavedChats: vi.fn() }));
vi.mock("./tools/create-shell-tool.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./tools/create-shell-tool.ts")>();
  return { ...original, createShellTool: vi.fn(original.createShellTool) };
});
vi.mock("./tools/find-shell.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tools/find-shell.ts")>()),
  findShell: () => ({ kind: "bash", name: "Bash", path: "bash" }),
}));
vi.mock("./tools/run-command.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tools/run-command.ts")>()),
  runCommand: vi.fn(),
}));

const folder = createTestFolder("chat-lifetimes");
const stopped: RunEnd = {
  ending: "stopped",
  exitCode: null,
  signal: null,
  isOutputOpen: false,
  durationMs: 10,
};

async function setup() {
  const saved: Awaited<ReturnType<SavedChats["list"]>> = [];
  const savedChats: SavedChats = {
    list: async () => saved,
    listArchived: async () => [],
    isPinned: () => false,
    pin: async () => undefined,
    archive: vi.fn(async () => undefined),
    unarchive: async () => undefined,
    remove: vi.fn(async () => undefined),
  };
  vi.mocked(createSavedChats).mockResolvedValue(savedChats);
  const sessions: AgentSession[] = [];
  const calls = new Map<string, Promise<unknown>[]>();
  vi.mocked(createAgentSession).mockImplementation(async (options) => {
    const manager = options?.sessionManager;
    if (manager === undefined) {
      throw new Error("The session manager is missing.");
    }
    const session = {
      sessionId: manager.getSessionId(),
      sessionManager: manager,
      messages: [],
      getAllTools: () => [],
      setActiveToolsByName: () => undefined,
      subscribe: () => () => undefined,
      abort: vi.fn(async () => {
        await Promise.all(calls.get(manager.getSessionId()) ?? []);
      }),
      dispose: vi.fn(),
      sendCustomMessage: vi.fn(async () => undefined),
    } as unknown as AgentSession;
    sessions.push(session);
    saved.push({
      id: session.sessionId,
      path: manager.getSessionFile() ?? "",
      cwd: folder,
      created: new Date(),
      modified: new Date(),
      messageCount: 1,
      firstMessage: "A chat.",
      allMessagesText: "A chat.",
    });
    return { session } as Awaited<ReturnType<typeof createAgentSession>>;
  });
  const commands: { options: RunOptions; finish: () => void }[] = [];
  vi.mocked(runCommand).mockImplementation((options) => {
    const running = Promise.withResolvers<RunEnd>();
    commands.push({ options, finish: () => running.resolve(stopped) });
    return running.promise;
  });
  const chat = await createChat({
    models: {} as ModelRuntime,
    directory: join(folder, randomUUID()),
    cwd: folder,
  });
  const tool = vi.mocked(createShellTool).mock.results.at(-1)?.value as ToolDefinition;
  function start(id: string): ReturnType<ToolDefinition["execute"]> {
    const context = {
      cwd: folder,
      sessionManager: { getSessionId: () => chat.getState().id },
    } as unknown as Parameters<ToolDefinition["execute"]>[4];
    const running = tool.execute(id, { command: "long command" }, undefined, undefined, context);
    const chatId = chat.getState().id as string;
    calls.set(chatId, [...(calls.get(chatId) ?? []), running]);
    return running;
  }
  return { chat, commands, sessions, savedChats, start };
}

test.each([
  { action: "archive", isOpen: false },
  { action: "archive", isOpen: true },
  { action: "delete", isOpen: false },
  { action: "delete", isOpen: true },
])(
  "$action waits for its chat's background commands and leaves another chat running when open is $isOpen",
  async ({ action, isOpen }) => {
    const { chat, commands, sessions, savedChats, start } = await setup();
    const id = chat.getState().id as string;
    const first = start("first");
    expect(chat.moveToBackground("first")).toBe(true);
    await first;
    await chat.startNew();
    const second = start("second");
    expect(chat.moveToBackground("second")).toBe(true);
    await second;
    const otherId = chat.getState().id as string;
    if (isOpen) {
      await chat.open(id);
    }
    try {
      const leaving = action === "archive" ? chat.archive(id, true) : chat.remove(id);
      await expect.poll(() => commands[0]?.options.signal?.aborted).toBe(true);
      expect(commands[1]?.options.signal?.aborted).toBe(false);
      expect(savedChats.archive).not.toHaveBeenCalled();
      expect(savedChats.remove).not.toHaveBeenCalled();
      commands[0]?.finish();
      expect(await leaving).toBe(true);
      expect(sessions[0]?.sendCustomMessage).not.toHaveBeenCalled();
      await chat.open(otherId);
      expect(chat.getState().backgroundCommands).toHaveLength(1);
    } finally {
      for (const command of commands) {
        command.finish();
      }
    }
  },
);

test("shutdown stops foreground and background commands across chats and waits for them", async () => {
  const { chat, commands, sessions, start } = await setup();
  const first = start("background");
  chat.moveToBackground("background");
  await first;
  await chat.startNew();
  const foreground = start("foreground");
  try {
    let hasStopped = false;
    const stopping = Promise.resolve(chat.stopAll()).then(() => {
      hasStopped = true;
    });
    await expect
      .poll(() => commands.every((command) => command.options.signal?.aborted))
      .toBe(true);
    expect(hasStopped).toBe(false);
    for (const command of commands) {
      command.finish();
    }
    await foreground;
    await stopping;
    for (const session of sessions) {
      expect(session.abort).toHaveBeenCalled();
      expect(session.sendCustomMessage).not.toHaveBeenCalled();
    }
  } finally {
    for (const command of commands) {
      command.finish();
    }
  }
});

test("shutdown waits for a command that moves to the background while it stops", async () => {
  const { chat, commands, start } = await setup();
  const running = start("moving");
  chat.moveToBackground("moving");
  const stopping = chat.stopAll();
  try {
    await running;
    expect(commands[0]?.options.signal?.aborted).toBe(true);
    const isWaiting = await Promise.race([
      stopping.then(() => false),
      new Promise<boolean>((resolve) => setImmediate(() => resolve(true))),
    ]);
    expect(isWaiting).toBe(true);
  } finally {
    for (const command of commands) {
      command.finish();
    }
    await stopping;
  }
});
