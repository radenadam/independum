import { join } from "node:path";
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  type ModelRuntime,
  type SessionInfo,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ChatEvent, ChatMessage, ChatState, ChatSummary } from "./api-types.ts";

type Model = NonNullable<ReturnType<ModelRuntime["getModel"]>>;
type AgentMessage = AgentSession["messages"][number];
type MessageContent =
  | Extract<AgentMessage, { role: "user" }>["content"]
  | Extract<AgentMessage, { role: "assistant" }>["content"];

// The first chat has no tools, and the prompt says so, so the model never pretends to use one.
const systemPrompt =
  "You are the assistant in Independum, an agent harness. You have no tools yet, so you cannot read files or run commands. Answer plainly and clearly.";

/** Options for the chat. */
export interface ChatOptions {
  models: ModelRuntime;
  directory: string;
  cwd: string;
}

/** The current chat, which the API shows, follows, and drives, and the saved chats beside it. */
export interface Chat {
  getState(): ChatState;
  getChats(): Promise<ChatSummary[]>;
  subscribe(listener: (event: ChatEvent) => void): () => void;
  send(text: string): boolean;
  chooseModel(providerId: string, modelId: string): Promise<boolean>;
  open(id: string): Promise<boolean>;
  stop(): Promise<void>;
  startNew(): Promise<void>;
}

/** Reopens the most recent chat, or waits for the user to choose a model before starting one. */
export async function createChat({ models, directory, cwd }: ChatOptions): Promise<Chat> {
  const sessionDirectory = join(directory, "sessions");
  const listeners = new Set<(event: ChatEvent) => void>();
  let session: AgentSession | undefined;
  let stopFollowing: (() => void) | undefined;
  let isModelChosen = false;
  let isReplying = false;

  function emit(event: ChatEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function getState(): ChatState {
    const model = isModelChosen ? session?.model : undefined;
    return {
      id: session?.sessionId ?? null,
      model: model === undefined ? null : { providerId: model.provider, id: model.id },
      messages: (session?.messages ?? []).flatMap((message) => {
        const shown = toChatMessage(message);
        return shown === undefined ? [] : [shown];
      }),
      isReplying,
    };
  }

  function listSaved(): Promise<SessionInfo[]> {
    return SessionManager.list(cwd, sessionDirectory);
  }

  async function getChats(): Promise<ChatSummary[]> {
    return (await listSaved()).map((saved) => ({
      id: saved.id,
      title: saved.name ?? saved.firstMessage,
      modified: saved.modified.getTime(),
    }));
  }

  function emitChats(): void {
    getChats().then((chats) => emit({ type: "chats", chats }));
  }

  function setReplying(value: boolean): void {
    isReplying = value;
    emit({ type: "replying", isReplying });
  }

  // Pi saves a chat with its first message and touches it again after every reply, so the chat
  // list follows both.
  function follow(event: AgentSessionEvent): void {
    if (event.type === "agent_start") {
      setReplying(true);
    } else if (event.type === "agent_settled") {
      setReplying(false);
      emitChats();
    } else if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      emit({ type: "replyDelta", delta: event.assistantMessageEvent.delta });
    } else if (event.type === "message_end") {
      const message = toChatMessage(event.message);
      if (message !== undefined) {
        emit({ type: "message", message });
      }
      if (event.message.role === "user") {
        emitChats();
      }
    }
  }

  async function openSession(manager: SessionManager, model?: Model): Promise<void> {
    stopFollowing?.();
    // Stopping a reply before leaving its chat lets Pi save what the reply has said so far.
    await session?.abort();
    session?.dispose();
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: directory,
      systemPrompt,
      noExtensions: true,
      noContextFiles: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
    });
    await resourceLoader.reload();
    const created = await createAgentSession({
      cwd,
      agentDir: directory,
      modelRuntime: models,
      resourceLoader,
      noTools: "builtin",
      sessionManager: manager,
      settingsManager: SettingsManager.inMemory(),
      ...(model === undefined ? {} : { model }),
    });
    session = created.session;
    stopFollowing = session.subscribe(follow);
    // Pi picks a provider default when a saved model has lost its login, which the user never chose.
    isModelChosen = session.model !== undefined && created.modelFallbackMessage === undefined;
    isReplying = false;
    emit({ type: "state", state: getState() });
    emitChats();
  }

  const [recent] = await listSaved();
  if (recent !== undefined) {
    await openSession(SessionManager.open(recent.path, sessionDirectory));
  }

  return {
    getState,
    getChats,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(text) {
      if (session === undefined || !isModelChosen || isReplying) {
        return false;
      }
      setReplying(true);
      session.prompt(text).catch((error: unknown) => {
        setReplying(false);
        emit({
          type: "message",
          message: { role: "assistant", text: "", error: messageOf(error), timestamp: Date.now() },
        });
      });
      return true;
    },
    async chooseModel(providerId, modelId) {
      const model = models.getModel(providerId, modelId);
      if (model === undefined || !models.hasConfiguredAuth(model.provider)) {
        return false;
      }
      if (session === undefined) {
        await openSession(SessionManager.create(cwd, sessionDirectory), model);
      } else {
        await session.setModel(model);
        isModelChosen = true;
        emit({ type: "state", state: getState() });
      }
      return true;
    },
    async open(id) {
      const saved = (await listSaved()).find((candidate) => candidate.id === id);
      if (saved === undefined) {
        return false;
      }
      if (saved.id !== session?.sessionId) {
        await openSession(SessionManager.open(saved.path, sessionDirectory));
      }
      return true;
    },
    async stop() {
      await session?.abort();
    },
    async startNew() {
      const model = isModelChosen ? session?.model : undefined;
      if (model !== undefined) {
        await openSession(SessionManager.create(cwd, sessionDirectory), model);
      }
    },
  };
}

function toChatMessage(message: AgentMessage): ChatMessage | undefined {
  if (message.role === "user") {
    return {
      role: "user",
      text: textOf(message.content),
      error: null,
      timestamp: message.timestamp,
    };
  }
  if (message.role !== "assistant") {
    return undefined;
  }
  return {
    role: "assistant",
    text: textOf(message.content),
    error: errorOf(message),
    timestamp: message.timestamp,
  };
}

// Pi reports a stopped reply with a technical message, so the chat shows a plain sentence instead.
function errorOf(message: Extract<AgentMessage, { role: "assistant" }>): string | null {
  if (message.stopReason === "aborted") {
    return "The reply was stopped.";
  }
  if (message.stopReason === "error") {
    return message.errorMessage ?? "The reply stopped early.";
  }
  return null;
}

function textOf(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  let text = "";
  for (const block of content) {
    if (block.type === "text") {
      text += block.text;
    }
  }
  return text;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The message could not be sent.";
}
