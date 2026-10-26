import { basename, join, resolve } from "node:path";
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
import type {
  AgentSummary,
  ArchivedChatSummary,
  ChatEvent,
  ChatMessage,
  ChatState,
  ChatSummary,
  ProjectSummary,
} from "./api-types.ts";
import { createSavedChats } from "./create-saved-chats.ts";

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

/** The open chat, which the API shows, follows, and drives, and the projects with their chats. */
export interface Chat {
  getState(): ChatState;
  getAgent(): AgentSummary;
  getProjects(): Promise<ProjectSummary[]>;
  subscribe(listener: (event: ChatEvent) => void): () => void;
  send(text: string): boolean;
  chooseModel(providerId: string, modelId: string): Promise<boolean>;
  chooseThinking(level: string): boolean;
  open(id: string): Promise<boolean>;
  stop(): Promise<void>;
  startNew(folder?: string): Promise<boolean>;
  rename(id: string, name: string): Promise<boolean>;
  pin(id: string, isPinned: boolean): Promise<boolean>;
  archive(id: string, isArchived: boolean): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  getArchived(): Promise<ArchivedChatSummary[]>;
}

/** Reopens the latest chat of the folder Independum starts from, or starts an empty one there. */
export async function createChat({ models, directory, cwd }: ChatOptions): Promise<Chat> {
  const sessionDirectory = join(directory, "sessions");
  const savedChats = await createSavedChats(sessionDirectory, join(directory, "pinned-chats.json"));
  const startFolder = toFolder(cwd);
  const listeners = new Set<(event: ChatEvent) => void>();
  let session: AgentSession | undefined;
  let folder = startFolder;
  let stopFollowing: (() => void) | undefined;
  let isModelChosen = false;
  let isReplying = false;
  let lastRequest: unknown = null;

  function emit(event: ChatEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function getState(): ChatState {
    const model = isModelChosen ? session?.model : undefined;
    return {
      id: session?.sessionId ?? null,
      folder,
      model: model === undefined ? null : { providerId: model.provider, id: model.id },
      // Pi offers only the levels that the model supports, and none for a model that cannot think.
      thinking:
        model === undefined || session?.supportsThinking() !== true
          ? null
          : { level: session.thinkingLevel, levels: session.getAvailableThinkingLevels() },
      messages: (session?.messages ?? []).flatMap((message) => {
        const shown = toChatMessage(message);
        return shown === undefined ? [] : [shown];
      }),
      isReplying,
    };
  }

  function listSaved(): Promise<SessionInfo[]> {
    return savedChats.list();
  }

  async function findSaved(id: string): Promise<SessionInfo | undefined> {
    return (await listSaved()).find((saved) => saved.id === id);
  }

  function summaryOf(saved: SessionInfo): ChatSummary {
    return {
      id: saved.id,
      title: saved.name ?? saved.firstMessage,
      modified: saved.modified.getTime(),
      isPinned: savedChats.isPinned(saved.id),
    };
  }

  // A chat file moves or goes away only after Pi stops writing to it, so leaving the open chat
  // starts an empty one in its folder first.
  async function leave(saved: SessionInfo): Promise<void> {
    if (saved.id === session?.sessionId) {
      await openNew(folderOf(saved), isModelChosen ? session.model : undefined);
    }
  }

  function folderOf(saved: SessionInfo): string {
    return saved.cwd === "" ? startFolder : toFolder(saved.cwd);
  }

  // The start folder comes first even without chats, so a new chat can always begin there. The
  // other projects follow in the order of their newest chat, because Pi lists chats newest first.
  async function getProjects(): Promise<ProjectSummary[]> {
    const projects = new Map<string, ProjectSummary>([
      [startFolder, { folder: startFolder, name: basename(startFolder), chats: [] }],
    ]);
    for (const saved of await listSaved()) {
      const savedFolder = folderOf(saved);
      const project = projects.get(savedFolder) ?? {
        folder: savedFolder,
        name: basename(savedFolder),
        chats: [],
      };
      project.chats.push(summaryOf(saved));
      projects.set(savedFolder, project);
    }
    return [...projects.values()];
  }

  function emitProjects(): void {
    getProjects().then((projects) => emit({ type: "projects", projects }));
  }

  function setReplying(value: boolean): void {
    isReplying = value;
    emit({ type: "replying", isReplying });
  }

  // Pi saves a chat with its first message and touches it again after every reply, so the projects
  // follow both.
  function follow(event: AgentSessionEvent): void {
    if (event.type === "agent_start") {
      setReplying(true);
    } else if (event.type === "agent_settled") {
      setReplying(false);
      emitProjects();
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
      // Pi tells its listeners about a message before it saves it, so the projects wait one turn
      // of the event loop. When they are read sooner, a new chat stays out of its project until
      // the reply ends.
      if (event.message.role === "user") {
        setImmediate(emitProjects);
      }
    }
  }

  function openSaved(saved: SessionInfo): Promise<void> {
    return openSession(SessionManager.open(saved.path, sessionDirectory), folderOf(saved), true);
  }

  function openNew(newFolder: string, model?: Model): Promise<void> {
    return openSession(SessionManager.create(newFolder, sessionDirectory), newFolder, false, model);
  }

  async function openSession(
    manager: SessionManager,
    sessionFolder: string,
    isSaved: boolean,
    model?: Model,
  ): Promise<void> {
    stopFollowing?.();
    // Stopping a reply before leaving its chat lets Pi save what the reply has said so far.
    await session?.abort();
    session?.dispose();
    const resourceLoader = new DefaultResourceLoader({
      cwd: sessionFolder,
      agentDir: directory,
      systemPrompt,
      noExtensions: true,
      noContextFiles: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      // Pi hands every request to its extensions before sending it, so this hidden one keeps a copy
      // for the Agent place and leaves the request as it is.
      extensionFactories: [
        {
          name: "independum-requests",
          hidden: true,
          factory: (pi) => {
            pi.on("before_provider_request", (event) => {
              lastRequest = event.payload;
            });
          },
        },
      ],
    });
    await resourceLoader.reload();
    const created = await createAgentSession({
      cwd: sessionFolder,
      agentDir: directory,
      modelRuntime: models,
      resourceLoader,
      noTools: "builtin",
      sessionManager: manager,
      settingsManager: SettingsManager.inMemory(),
      ...(model === undefined ? {} : { model }),
    });
    session = created.session;
    folder = sessionFolder;
    stopFollowing = session.subscribe(follow);
    // Pi picks a provider default for a new chat without a model, and for a saved chat whose model
    // has lost its login. The user chose neither.
    isModelChosen =
      session.model !== undefined &&
      created.modelFallbackMessage === undefined &&
      (model !== undefined || isSaved);
    isReplying = false;
    lastRequest = null;
    emit({ type: "state", state: getState() });
    emitProjects();
  }

  // Pi builds the system prompt from Independum's prompt and then adds its own sections, such as
  // the folder, so everything after Independum's prompt is what Pi adds.
  function getAgent(): AgentSummary {
    const fullPrompt = session?.systemPrompt ?? systemPrompt;
    return {
      systemPrompt,
      addedByPi: fullPrompt.startsWith(systemPrompt)
        ? fullPrompt.slice(systemPrompt.length).trim()
        : fullPrompt,
      tools: session?.getActiveToolNames() ?? [],
      lastRequest,
    };
  }

  const latest = (await listSaved()).find((saved) => folderOf(saved) === startFolder);
  await (latest === undefined ? openNew(startFolder) : openSaved(latest));

  return {
    getState,
    getAgent,
    getProjects,
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
      if (
        session === undefined ||
        model === undefined ||
        !models.hasConfiguredAuth(model.provider)
      ) {
        return false;
      }
      await session.setModel(model);
      isModelChosen = true;
      emit({ type: "state", state: getState() });
      return true;
    },
    chooseThinking(level) {
      const chosen =
        isModelChosen && session?.supportsThinking() === true
          ? session.getAvailableThinkingLevels().find((candidate) => candidate === level)
          : undefined;
      if (session === undefined || chosen === undefined) {
        return false;
      }
      session.setThinkingLevel(chosen);
      emit({ type: "state", state: getState() });
      return true;
    },
    async rename(id, name) {
      const saved = await findSaved(id);
      const trimmed = name.trim();
      if (saved === undefined || trimmed === "") {
        return false;
      }
      if (saved.id === session?.sessionId) {
        session.setSessionName(trimmed);
      } else {
        SessionManager.open(saved.path, sessionDirectory).appendSessionInfo(trimmed);
      }
      emitProjects();
      return true;
    },
    async pin(id, isPinned) {
      if ((await findSaved(id)) === undefined) {
        return false;
      }
      await savedChats.pin(id, isPinned);
      emitProjects();
      return true;
    },
    async archive(id, isArchived) {
      const saved = isArchived
        ? await findSaved(id)
        : (await savedChats.listArchived()).find((candidate) => candidate.id === id);
      if (saved === undefined) {
        return false;
      }
      if (isArchived) {
        await leave(saved);
        await savedChats.archive(saved);
      } else {
        await savedChats.unarchive(saved);
      }
      emitProjects();
      return true;
    },
    async remove(id) {
      const saved = [...(await listSaved()), ...(await savedChats.listArchived())].find(
        (candidate) => candidate.id === id,
      );
      if (saved === undefined) {
        return false;
      }
      await leave(saved);
      await savedChats.remove(saved);
      emitProjects();
      return true;
    },
    async getArchived() {
      return (await savedChats.listArchived()).map((saved) => ({
        ...summaryOf(saved),
        folder: folderOf(saved),
        projectName: basename(folderOf(saved)),
      }));
    },
    async open(id) {
      const saved = await findSaved(id);
      if (saved === undefined) {
        return false;
      }
      if (saved.id !== session?.sessionId) {
        await openSaved(saved);
      }
      return true;
    },
    async stop() {
      await session?.abort();
    },
    async startNew(newFolder) {
      const target = newFolder === undefined ? folder : toFolder(newFolder);
      const projects = await getProjects();
      if (!projects.some((project) => project.folder === target)) {
        return false;
      }
      await openNew(target, isModelChosen ? session?.model : undefined);
      return true;
    },
  };
}

// Windows paths can carry the drive letter in either case, so one folder could look like two.
function toFolder(path: string): string {
  return resolve(path).replace(/^[a-z]:/, (drive) => drive.toUpperCase());
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
