import { join } from "node:path";
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  type ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ChatEvent, ChatMessage, ChatState } from "./api-types.ts";

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

/** The current chat, which the API shows, follows, and drives. */
export interface Chat {
  getState(): ChatState;
  subscribe(listener: (event: ChatEvent) => void): () => void;
  send(text: string): boolean;
  chooseModel(providerId: string, modelId: string): Promise<boolean>;
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
      model: model === undefined ? null : { providerId: model.provider, id: model.id },
      messages: (session?.messages ?? []).flatMap((message) => {
        const shown = toChatMessage(message);
        return shown === undefined ? [] : [shown];
      }),
      isReplying,
    };
  }

  function setReplying(value: boolean): void {
    isReplying = value;
    emit({ type: "replying", isReplying });
  }

  function follow(event: AgentSessionEvent): void {
    if (event.type === "agent_start" || event.type === "agent_settled") {
      setReplying(event.type === "agent_start");
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
    }
  }

  async function open(manager: SessionManager, model?: Model): Promise<void> {
    stopFollowing?.();
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
  }

  const [recent] = (await SessionManager.list(cwd, sessionDirectory)).sort(
    (first, second) => second.modified.getTime() - first.modified.getTime(),
  );
  if (recent !== undefined) {
    await open(SessionManager.open(recent.path, sessionDirectory));
  }

  return {
    getState,
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
          message: { role: "assistant", text: "", error: messageOf(error) },
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
        await open(SessionManager.create(cwd, sessionDirectory), model);
      } else {
        await session.setModel(model);
        isModelChosen = true;
        emit({ type: "state", state: getState() });
      }
      return true;
    },
    async stop() {
      await session?.abort();
    },
    async startNew() {
      const model = isModelChosen ? session?.model : undefined;
      if (model !== undefined) {
        await open(SessionManager.create(cwd, sessionDirectory), model);
      }
    },
  };
}

function toChatMessage(message: AgentMessage): ChatMessage | undefined {
  if (message.role === "user") {
    return { role: "user", text: textOf(message.content), error: null };
  }
  if (message.role !== "assistant") {
    return undefined;
  }
  const isCut = message.stopReason === "error" || message.stopReason === "aborted";
  return {
    role: "assistant",
    text: textOf(message.content),
    error: isCut ? (message.errorMessage ?? "The reply stopped early.") : null,
  };
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
