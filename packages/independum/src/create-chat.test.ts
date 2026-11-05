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
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ChatEvent } from "./api-types.ts";
import { createChatRoutes } from "./chat-routes.ts";
import { createChat } from "./create-chat.ts";
import { followEventStream } from "./follow-event-stream.ts";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const original = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return { ...original, createAgentSession: vi.fn() };
});

interface SessionDouble {
  session: AgentSession;
  emit(event: AgentSessionEvent): void;
  setStreaming(message: AgentSession["agent"]["state"]["streamingMessage"]): void;
}

const cwd = process.cwd();
const directory = join(cwd, "node_modules", "independum-chat-test");
const model = { provider: "faux", id: "chosen" };
const models = {
  getModel: () => model,
  hasConfiguredAuth: () => true,
} as unknown as ModelRuntime;
let sessions: SessionDouble[];
let saved: SessionInfo[];
let managers: Map<string, SessionManager>;

function createSession(manager: SessionManager): SessionDouble {
  const listeners = new Set<(event: AgentSessionEvent) => void>();
  const state: { streamingMessage: AgentSession["agent"]["state"]["streamingMessage"] } = {
    streamingMessage: undefined,
  };
  const session = {
    sessionId: manager.getSessionId(),
    sessionManager: manager,
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

function savedChat(): SessionInfo {
  const manager = SessionManager.inMemory(cwd);
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

beforeEach(() => {
  sessions = [];
  saved = [];
  managers = new Map();
  vi.spyOn(DefaultResourceLoader.prototype, "reload").mockResolvedValue(undefined);
  vi.spyOn(SessionManager, "create").mockImplementation(() => SessionManager.inMemory(cwd));
  vi.spyOn(SessionManager, "listAll").mockImplementation(async () => saved);
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
      const double = createSession(options?.sessionManager ?? SessionManager.inMemory(cwd));
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
  expect(await Promise.all([first, second])).toEqual([true, true]);
  const active = sessionAt(-1);
  active.emit({ type: "agent_start" });
  expect(chat.getReplyingIds()).toEqual([info.id]);
  expect(createAgentSession).toHaveBeenCalledTimes(2);
  expect(active.session.dispose).not.toHaveBeenCalled();
});

test("a failed saved open can be retried", async () => {
  const chat = await createChat({ models, directory, cwd });
  const info = savedChat();
  vi.mocked(createAgentSession).mockRejectedValueOnce(new Error("The session cannot load."));
  await expect(chat.open(info.id)).rejects.toThrow("The session cannot load.");
  expect(await chat.open(info.id)).toBe(true);
  expect(chat.getState().id).toBe(info.id);
});

test("a model choice stays with its chat when another chat opens before it finishes", async () => {
  const chat = await createChat({ models, directory, cwd });
  const original = sessionAt(0);
  original.emit({ type: "agent_start" });
  const chosen = Promise.withResolvers<void>();
  vi.mocked(original.session.setModel).mockReturnValueOnce(chosen.promise);
  const choosing = chat.chooseModel("faux", "chosen");
  expect(await chat.startNew()).toBe(true);
  chosen.resolve();
  expect(await choosing).toBe(true);
  expect(chat.getState().model).toBeNull();
  expect(await chat.open(original.session.sessionId)).toBe(true);
  expect(chat.getState().model).toEqual({ providerId: "faux", id: "chosen" });
});

test("reconnecting and changing effort restore every part of the reply so far", async () => {
  const chat = await createChat({ models, directory, cwd });
  await chat.chooseModel("faux", "chosen");
  const active = sessionAt(0);
  active.emit({ type: "agent_start" });
  active.setStreaming(
    fauxAssistantMessage([
      fauxThinking("The thought so far."),
      fauxText("The reply so far."),
      fauxToolCall("Shell", { command: "echo hello" }, { id: "call" }),
    ]),
  );
  const events = followEventStream<ChatEvent>(
    await createChatRoutes(chat, models).request("/chat/events"),
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
  chat.subscribe((event) => changes.push(event));
  expect(chat.chooseThinking("low")).toBe(true);
  expect(changes.find((event) => event.type === "state")).toHaveProperty("state.reply", expected);
  active.setStreaming(undefined);
  expect(chat.getState()).toHaveProperty("reply", []);
});

test("a foreground tool keeps its start and latest progress while its chat is closed", async () => {
  const chat = await createChat({ models, directory, cwd });
  const active = sessionAt(0);
  active.emit({ type: "agent_start" });
  active.emit({ type: "tool_execution_start", toolCallId: "call", toolName: "Shell", args: {} });
  const started = chat.getState();
  expect(started).toHaveProperty("toolRuns.call", {
    startedAt: expect.any(Number),
    details: null,
  });
  expect(await chat.startNew()).toBe(true);
  expect(chat.getState()).toHaveProperty("toolRuns", {});
  expect(await chat.open(active.session.sessionId)).toBe(true);
  expect(chat.getState().toolRuns).toEqual(started.toolRuns);
  expect(await chat.startNew()).toBe(true);
  const progress = { shell: "Test shell", output: "Ready", lastOutputAt: Date.now() };
  active.emit({
    type: "tool_execution_update",
    toolCallId: "call",
    toolName: "Shell",
    args: {},
    partialResult: { content: [], details: progress },
  });
  expect(await chat.open(active.session.sessionId)).toBe(true);
  expect(chat.getState()).toHaveProperty("toolRuns.call", {
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
  expect(chat.getState()).toHaveProperty("toolRuns", {});
  expect(started.toolRuns.call?.details).toBeNull();
});
