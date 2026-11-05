import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  type ModelRuntime,
  type SessionInfo,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ChatEvent } from "./api-types.ts";
import { createChatRoutes } from "./chat-routes.ts";
import { type Chat, createChat, type OpenChat } from "./create-chat.ts";
import { createSavedChats, type SavedChats } from "./create-saved-chats.ts";
import { followEventStream } from "./follow-event-stream.ts";
import { createShellTool } from "./tools/create-shell-tool.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";
import { type RunEnd, type RunOptions, runCommand } from "./tools/run-command.ts";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const original = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return { ...original, createAgentSession: vi.fn() };
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

interface SessionDouble {
  session: AgentSession;
  emit(event: AgentSessionEvent): void;
  setStreaming(message: AgentSession["agent"]["state"]["streamingMessage"]): void;
}

const cwd = process.cwd();
const folder = createTestFolder("chat");
const directory = join(folder, "state");
const model = { provider: "faux", id: "chosen" };
const models = {
  getModel: () => model,
  hasConfiguredAuth: () => true,
} as unknown as ModelRuntime;
let sessions: SessionDouble[];
let saved: SessionInfo[];
let managers: Map<string, SessionManager>;
let savedChats: SavedChats;
let calls: Map<string, Promise<unknown>[]>;

const stopped: RunEnd = {
  ending: "stopped",
  exitCode: null,
  signal: null,
  isOutputOpen: false,
  durationMs: 10,
};

function createSession(manager: SessionManager, settingsManager: SettingsManager): SessionDouble {
  const listeners = new Set<(event: AgentSessionEvent) => void>();
  const state: { streamingMessage: AgentSession["agent"]["state"]["streamingMessage"] } = {
    streamingMessage: undefined,
  };
  const session = {
    sessionId: manager.getSessionId(),
    sessionManager: manager,
    settingsManager,
    model,
    messages: [],
    agent: { state },
    thinkingLevel: "off",
    supportsThinking: () => true,
    getAvailableThinkingLevels: () => ["off", "low"],
    setThinkingLevel: vi.fn(),
    setModel: vi.fn().mockResolvedValue(undefined),
    setActiveToolsByName: vi.fn(),
    getAllTools: () => [],
    abort: vi.fn(async () => {
      await Promise.all(calls.get(manager.getSessionId()) ?? []);
    }),
    sendCustomMessage: vi.fn(async () => undefined),
    waitForIdle: vi.fn(async () => undefined),
    dispose: vi.fn(),
    subscribe(listener: (event: AgentSessionEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as AgentSession;
  return {
    session,
    emit(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    setStreaming(message) {
      state.streamingMessage = message;
    },
  };
}

function savedChat(manager: SessionManager = SessionManager.inMemory(cwd)): SessionInfo {
  const info: SessionInfo = {
    id: manager.getSessionId(),
    path: join(directory, `${manager.getSessionId()}.jsonl`),
    cwd,
    created: new Date(),
    modified: new Date(),
    firstMessage: "A saved chat",
    allMessagesText: "A saved chat",
    messageCount: 1,
  };
  saved.push(info);
  managers.set(info.path, manager);
  return info;
}

function sessionAt(index: number): SessionDouble {
  const session = sessions.at(index);
  if (session === undefined) {
    throw new Error("The session does not exist.");
  }
  return session;
}

async function openTestChat(chat: Chat, id?: string): Promise<OpenChat> {
  const opened = await chat.open(id ?? (await chat.first()));
  if (opened === undefined) {
    throw new Error("The test chat did not open.");
  }
  return opened;
}

async function startTestChat(chat: Chat, source: OpenChat): Promise<OpenChat> {
  const id = await chat.startNew(source.getState().id);
  if (id === undefined) {
    throw new Error("The next test chat did not start.");
  }
  return openTestChat(chat, id);
}

beforeEach(() => {
  sessions = [];
  saved = [];
  managers = new Map();
  calls = new Map();
  savedChats = {
    list: async () => saved,
    listArchived: async () => [],
    isPinned: () => false,
    pin: async () => undefined,
    archive: vi.fn(async () => undefined),
    unarchive: async () => undefined,
    remove: vi.fn(async () => undefined),
  };
  vi.mocked(createSavedChats).mockResolvedValue(savedChats);
  vi.spyOn(DefaultResourceLoader.prototype, "reload").mockResolvedValue(undefined);
  vi.spyOn(SessionManager, "create").mockImplementation(() => SessionManager.inMemory(cwd));
  vi.spyOn(SessionManager, "open").mockImplementation((path) => {
    const manager = managers.get(path);
    if (manager === undefined) {
      throw new Error("The saved session does not exist.");
    }
    return manager;
  });
  vi.mocked(createAgentSession)
    .mockReset()
    .mockImplementation(async (options) => {
      const double = createSession(
        options?.sessionManager ?? SessionManager.inMemory(cwd),
        options?.settingsManager ?? SettingsManager.inMemory(),
      );
      sessions.push(double);
      return { session: double.session } as Awaited<ReturnType<typeof createAgentSession>>;
    });
});

afterEach(() => vi.restoreAllMocks());

test("concurrent opens share one saved session and keep its reply tracked", async () => {
  const chat = await createChat({ models, directory, cwd });
  const info = savedChat();
  const loading = Promise.withResolvers<void>();
  const loaded = Promise.withResolvers<void>();
  vi.mocked(DefaultResourceLoader.prototype.reload).mockImplementationOnce(() => {
    loading.resolve();
    return loaded.promise;
  });
  const first = chat.open(info.id);
  const second = chat.open(info.id);
  await loading.promise;
  loaded.resolve();
  const followers = await Promise.all([first, second]);
  expect(followers.map((opened) => opened?.getState().id)).toEqual([info.id, info.id]);
  const active = sessionAt(-1);
  active.emit({ type: "agent_start" });
  expect(chat.getReplyingIds()).toEqual([info.id]);
  expect(createAgentSession).toHaveBeenCalledTimes(1);
  expect(active.session.dispose).not.toHaveBeenCalled();
});

test("a failed saved open can be retried", async () => {
  const chat = await createChat({ models, directory, cwd });
  const info = savedChat();
  vi.mocked(createAgentSession).mockRejectedValueOnce(new Error("The session cannot load."));
  await expect(chat.open(info.id)).rejects.toThrow("The session cannot load.");
  expect((await chat.open(info.id))?.getState().id).toBe(info.id);
});

test("a model choice stays with its chat when another chat opens before it finishes", async () => {
  const chat = await createChat({ models, directory, cwd });
  const opened = await openTestChat(chat);
  const original = sessionAt(-1);
  original.emit({ type: "agent_start" });
  const chosen = Promise.withResolvers<void>();
  vi.mocked(original.session.setModel).mockReturnValueOnce(chosen.promise);
  const choosing = opened.chooseModel("faux", "chosen");
  const other = await startTestChat(chat, opened);
  chosen.resolve();
  expect(await choosing).toBe(true);
  expect(other.getState().model).toBeNull();
  const originalChat = await openTestChat(chat, original.session.sessionId);
  expect(originalChat.getState().model).toEqual({ providerId: "faux", id: "chosen" });
});

test("reconnecting and changing effort restore every part of the reply so far", async () => {
  const chat = await createChat({ models, directory, cwd });
  const opened = await openTestChat(chat);
  await opened.chooseModel("faux", "chosen");
  const active = sessionAt(-1);
  active.emit({ type: "agent_start" });
  active.setStreaming(
    fauxAssistantMessage([
      fauxThinking("The thought so far."),
      fauxText("The reply so far."),
      fauxToolCall("Shell", { command: "echo hello" }, { id: "call" }),
    ]),
  );
  const events = followEventStream<ChatEvent>(
    await createChatRoutes(chat, models).request(`/chats/${opened.getState().id}/events`),
  );
  const first = await events.next();
  await events.close();
  const expected = [
    { type: "thinking", text: "The thought so far.", isRedacted: false, durationMs: null },
    { type: "text", text: "The reply so far." },
    { type: "toolCall", id: "call", name: "Shell", input: { command: "echo hello" }, result: null },
  ];
  expect(first.type === "state" ? first.state : undefined).toHaveProperty("reply", expected);
  const changes: ChatEvent[] = [];
  opened.subscribe((event) => changes.push(event));
  expect(opened.chooseThinking("low")).toBe(true);
  expect(changes.find((event) => event.type === "state")).toHaveProperty("state.reply", expected);
  active.setStreaming(undefined);
  expect(opened.getState()).toHaveProperty("reply", []);
});

test("a foreground tool keeps its start and latest progress while its chat is closed", async () => {
  const chat = await createChat({ models, directory, cwd });
  let opened = await openTestChat(chat);
  const active = sessionAt(-1);
  active.emit({ type: "agent_start" });
  active.emit({ type: "tool_execution_start", toolCallId: "call", toolName: "Shell", args: {} });
  const started = opened.getState();
  expect(started).toHaveProperty("toolRuns.call", {
    startedAt: expect.any(Number),
    details: null,
  });
  const next = await startTestChat(chat, opened);
  opened.close();
  expect(next.getState()).toHaveProperty("toolRuns", {});
  opened = await openTestChat(chat, active.session.sessionId);
  expect(opened.getState().toolRuns).toEqual(started.toolRuns);
  await startTestChat(chat, opened);
  opened.close();
  const progress = { shell: "Test shell", output: "Ready", lastOutputAt: Date.now() };
  active.emit({
    type: "tool_execution_update",
    toolCallId: "call",
    toolName: "Shell",
    args: {},
    partialResult: { content: [], details: progress },
  });
  opened = await openTestChat(chat, active.session.sessionId);
  expect(opened.getState()).toHaveProperty("toolRuns.call", {
    ...started.toolRuns.call,
    details: progress,
  });
  active.emit({
    type: "tool_execution_end",
    toolCallId: "call",
    toolName: "Shell",
    result: { content: [], details: {} },
    isError: false,
  });
  expect(opened.getState()).toHaveProperty("toolRuns", {});
  expect(started.toolRuns.call?.details).toBeNull();
});

function finishCommands(commands: { finish: () => void }[]): void {
  for (const command of commands) {
    command.finish();
  }
}

async function setup() {
  const commands: { options: RunOptions; finish: () => void }[] = [];
  vi.mocked(runCommand).mockImplementation((options) => {
    const running = Promise.withResolvers<RunEnd>();
    commands.push({ options, finish: () => running.resolve(stopped) });
    return running.promise;
  });
  const chat = await createChat({ models, directory: join(folder, randomUUID()), cwd });
  const opened = await openTestChat(chat);
  const tool = vi.mocked(createShellTool).mock.results.at(-1)?.value as ToolDefinition;
  function start(opened: OpenChat, id: string): ReturnType<ToolDefinition["execute"]> {
    const chatId = opened.getState().id as string;
    const active = sessions.find((double) => double.session.sessionId === chatId);
    if (active === undefined) {
      throw new Error("The command session does not exist.");
    }
    if (!saved.some((info) => info.id === chatId)) {
      savedChat(active.session.sessionManager);
    }
    const context = {
      cwd,
      sessionManager: { getSessionId: () => chatId },
    } as unknown as Parameters<ToolDefinition["execute"]>[4];
    const running = tool.execute(id, { command: "long command" }, undefined, undefined, context);
    calls.set(chatId, [...(calls.get(chatId) ?? []), running]);
    return running;
  }
  return { chat, opened, commands, sessions, savedChats, start };
}

test.each([
  { action: "archive", isOpen: false },
  { action: "archive", isOpen: true },
  { action: "delete", isOpen: false },
  { action: "delete", isOpen: true },
])(
  "$action waits for its chat's background commands and leaves another chat running when open is $isOpen",
  async ({ action, isOpen }) => {
    const { chat, opened, commands, sessions, savedChats, start } = await setup();
    const id = opened.getState().id as string;
    const first = start(opened, "first");
    expect(opened.moveToBackground("first")).toBe(true);
    await first;
    const other = await startTestChat(chat, opened);
    opened.close();
    const second = start(other, "second");
    expect(other.moveToBackground("second")).toBe(true);
    await second;
    const otherId = other.getState().id;
    if (isOpen) {
      const followed = await openTestChat(chat, id);
      followed.subscribe(() => undefined);
      followed.close();
    }
    try {
      const leaving = action === "archive" ? chat.archive(id, true) : chat.remove(id);
      await expect.poll(() => commands[0]?.options.signal?.aborted).toBe(true);
      expect(commands[1]?.options.signal?.aborted).toBe(false);
      expect(savedChats.archive).not.toHaveBeenCalled();
      expect(savedChats.remove).not.toHaveBeenCalled();
      commands[0]?.finish();
      expect(await leaving).toBe(true);
      expect(
        sessions.find((double) => double.session.sessionId === id)?.session.sendCustomMessage,
      ).not.toHaveBeenCalled();
      const otherChat = await openTestChat(chat, otherId);
      expect(otherChat.getState().backgroundCommands).toHaveLength(1);
    } finally {
      finishCommands(commands);
    }
  },
);

test("shutdown stops foreground and background commands across chats and waits for them", async () => {
  const { chat, opened, commands, sessions, start } = await setup();
  const first = start(opened, "background");
  opened.moveToBackground("background");
  await first;
  const other = await startTestChat(chat, opened);
  opened.close();
  const foreground = start(other, "foreground");
  try {
    let hasStopped = false;
    const stopping = Promise.resolve(chat.stopAll()).then(() => {
      hasStopped = true;
    });
    await expect
      .poll(() => commands.every((command) => command.options.signal?.aborted))
      .toBe(true);
    expect(hasStopped).toBe(false);
    finishCommands(commands);
    await foreground;
    await stopping;
    for (const session of sessions.filter(
      (double) => vi.mocked(double.session.dispose).mock.calls.length === 0,
    )) {
      expect(session.session.abort).toHaveBeenCalled();
      expect(session.session.sendCustomMessage).not.toHaveBeenCalled();
    }
  } finally {
    finishCommands(commands);
  }
});

test("shutdown waits for a command that moves to the background while it stops", async () => {
  const { chat, opened, commands, start } = await setup();
  const running = start(opened, "moving");
  opened.moveToBackground("moving");
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
    finishCommands(commands);
    await stopping;
  }
});

test("a background note retains its chat through compaction and delivery", async () => {
  const { chat, opened, commands, start } = await setup();
  const active = sessionAt(-1);
  const idle = Promise.withResolvers<void>();
  const delivered = Promise.withResolvers<void>();
  vi.mocked(active.session.waitForIdle).mockReturnValueOnce(idle.promise);
  vi.mocked(active.session.sendCustomMessage).mockReturnValueOnce(delivered.promise);
  const running = start(opened, "pending-note");
  opened.moveToBackground("pending-note");
  await running;
  active.emit({ type: "compaction_start", reason: "manual" });
  await startTestChat(chat, opened);
  opened.close();
  try {
    commands[0]?.finish();
    await expect.poll(() => vi.mocked(active.session.waitForIdle).mock.calls.length).toBe(1);
    expect(active.session.sendCustomMessage).not.toHaveBeenCalled();
    active.emit({
      type: "compaction_end",
      reason: "manual",
      result: undefined,
      aborted: false,
      willRetry: false,
    });
    expect(active.session.dispose).not.toHaveBeenCalled();
    idle.resolve();
    await expect.poll(() => vi.mocked(active.session.sendCustomMessage).mock.calls.length).toBe(1);
    expect(active.session.dispose).not.toHaveBeenCalled();
    delivered.resolve();
    await expect.poll(() => vi.mocked(active.session.dispose).mock.calls.length).toBe(1);
  } finally {
    idle.resolve();
    delivered.resolve();
    await chat.stopAll();
  }
});

test.each(["archive", "delete", "shutdown"])(
  "%s discards a background note waiting for manual compaction",
  async (action) => {
    const { chat, opened, commands, start } = await setup();
    const active = sessionAt(-1);
    const idle = Promise.withResolvers<void>();
    vi.mocked(active.session.waitForIdle).mockReturnValueOnce(idle.promise);
    const running = start(opened, "stopping-note");
    opened.moveToBackground("stopping-note");
    await running;
    active.emit({ type: "compaction_start", reason: "manual" });
    try {
      commands[0]?.finish();
      await expect.poll(() => vi.mocked(active.session.waitForIdle).mock.calls.length).toBe(1);
      vi.mocked(active.session.abort).mockImplementationOnce(async () => {
        idle.resolve();
        await idle.promise;
      });
      const id = active.session.sessionId;
      if (action === "shutdown") {
        await chat.stopAll();
      } else {
        expect(await (action === "archive" ? chat.archive(id, true) : chat.remove(id))).toBe(true);
      }
      expect(active.session.sendCustomMessage).not.toHaveBeenCalled();
    } finally {
      idle.resolve();
      await chat.stopAll();
    }
  },
);

test("foreground commands with matching call ids keep their chat's controls", async () => {
  const { chat, opened, commands, start } = await setup();
  const other = await startTestChat(chat, opened);
  const first = start(opened, "same-call");
  const second = start(other, "same-call");
  try {
    expect(opened.stopCommand("same-call")).toBe(true);
    expect(commands[0]?.options.signal?.aborted).toBe(true);
    expect(commands[1]?.options.signal?.aborted).toBe(false);
    other.moveToBackground("same-call");
    await second;
    expect(opened.getState().backgroundCommands).toEqual([]);
    expect(other.getState().backgroundCommands).toHaveLength(1);
  } finally {
    finishCommands(commands);
    await Promise.all([first, second]);
    await chat.stopAll();
  }
});
