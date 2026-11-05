import { rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { clampThinkingLevel, getSupportedThinkingLevels } from "@earendil-works/pi-ai/compat";
import {
  type AgentSession,
  type AgentSessionEvent,
  buildSessionContext,
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionAPI,
  type ModelRuntime,
  type SessionEntry,
  type SessionInfo,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  addedFactPrompt,
  addMessageTimes,
  messageTimeText,
  summarizeAddedFacts,
} from "./added-facts.ts";
import { allTexts, systemPromptText } from "./agent-texts.ts";
import type {
  AgentSummary,
  ArchivedChatSummary,
  ChatEvent,
  ChatMessage,
  ChatOverrides,
  ChatState,
  ChatSummary,
  ChatsEvent,
  CommandEnd,
  ConfigurationIssue,
  ContextSummary,
  MessagePart,
  ProfileReference,
  ProjectSummary,
  Settings,
  SettingsChange,
  ShellChoice,
  ShellKind,
  ToolCallPart,
  ToolResult,
  ToolSummary,
} from "./api-types.ts";
import { configurationRevision } from "./configuration-files.ts";
import { escapePointer } from "./configuration-schema.ts";
import {
  createProfileStore,
  type ProfileStore,
  type ResolvedProfile,
} from "./create-profile-store.ts";
import { createSavedChats } from "./create-saved-chats.ts";
import { createSavedRequests } from "./create-saved-requests.ts";
import { listRequests } from "./list-requests.ts";
import { applyModelOverrides, changeModelOverrides, modelSettingsOf } from "./model-settings.ts";
import { changeTexts, createModelTexts, summarizeTexts } from "./model-texts.ts";
import { summarizePiTexts } from "./pi-texts.ts";
import { builtInSettings } from "./read-settings-change.ts";
import { subscribeTo } from "./subscribe-to.ts";
import { describeNextRequest, type KnownTexts, summarizeRequest } from "./summarize-request.ts";
import {
  type BackgroundEnded,
  createBackgroundCommands,
  describeBackgroundNote,
} from "./tools/create-background-commands.ts";
import { createCheckCommandTool } from "./tools/create-check-command-tool.ts";
import { createEditTool } from "./tools/create-edit-tool.ts";
import { createReadTool } from "./tools/create-read-tool.ts";
import { createShellTool } from "./tools/create-shell-tool.ts";
import { createStopCommandTool } from "./tools/create-stop-command-tool.ts";
import { createWriteTool } from "./tools/create-write-tool.ts";
import { environmentSuggestions } from "./tools/environment-suggestions.ts";
import { defaultShellKind, findShell, missingShellOf } from "./tools/find-shell.ts";

type Model = NonNullable<ReturnType<ModelRuntime["getModel"]>>;
type AgentMessage = AgentSession["messages"][number];
type MessageContent =
  | Extract<AgentMessage, { role: "user" }>["content"]
  | Extract<AgentMessage, { role: "assistant" }>["content"];
type ReplyUpdate = Extract<AgentSessionEvent, { type: "message_update" }>["assistantMessageEvent"];
type ToolResultMessage = Extract<AgentMessage, { role: "toolResult" }>;

/** How long the model thought in each part of a reply, as Independum saves it in the chat. */
interface ThinkingTimes {
  timestamp: number;
  durationsMs: (number | null)[];
}

/** A chat that runs: its Pi session, and what Independum keeps for it while it runs. */
interface ChatRun {
  session: AgentSession;
  // The hidden extension of the chat, through which Independum registers its tools anew.
  extension: ExtensionAPI | undefined;
  folder: string;
  stopFollowing: () => void;
  isModelChosen: boolean;
  isReplying: boolean;
  isCompacting: boolean;
  compactionError: string | null;
  contextVersion: number;
  pendingNotes: number;
  lastRequest: unknown;
  cacheWarmings: number;
  // The thinking of the reply in progress, by the place of each part in the message.
  thinkingStarts: Map<number, number>;
  thinkingTimes: Map<number, number>;
  lastCallUpdate: number;
  toolRuns: ChatState["toolRuns"];
  listeners: Set<(event: ChatEvent) => void>;
  users: number;
  isClosing: boolean;
  configuration: ResolvedProfile;
  desired: ResolvedProfile | undefined;
  rebuilding: Promise<void> | undefined;
  ownTools: ToolDefinition[];
}

// Pi keeps no time for thinking, so Independum saves it in a custom entry, which Pi keeps in the
// chat file and never sends to the model.
const thinkingTimesType = "independum-thinking-times";
// The note that wakes the agent when one of its background commands ends.
const commandEndType = "independum-command-end";

const shellKinds: ShellKind[] = ["powershell", "bash"];
// A tool call that the model is still writing reaches the chat at most this often.
const callUpdateInterval = 80;

/** Options for the chat. */
export interface ChatOptions {
  models: ModelRuntime;
  directory: string;
  folder: string;
}

/** A chat held by an API request, with a separate subscription for each follower. */
export interface OpenChat {
  getState(): ChatState;
  getAgent(): AgentSummary;
  getContext(): ContextSummary;
  subscribe(listener: (event: ChatEvent) => void): () => void;
  send(text: string): Promise<boolean>;
  chooseModel(providerId: string, modelId: string): Promise<boolean>;
  chooseThinking(level: string): Promise<boolean>;
  compact(): Promise<boolean>;
  stop(): Promise<void>;
  stopCommand(id: string): boolean;
  moveToBackground(id: string): boolean;
  close(): void;
}

/** The independent chat runs and the projects with their chats. */
export interface Chat {
  first(): Promise<string>;
  open(id: string): Promise<OpenChat | undefined>;
  profiles: ProfileStore;
  changeSettings(
    reference: ProfileReference,
    projectId: string,
    change: SettingsChange,
    revision: string | undefined,
  ): Promise<boolean>;
  profileAgent(reference: ProfileReference, projectId: string): AgentSummary;
  reconcile(): Promise<void>;
  getProjects(): Promise<ProjectSummary[]>;
  getReplyingIds(): string[];
  subscribe(listener: (event: ChatsEvent) => void): () => void;
  stopAll(): Promise<void>;
  startNew(id: string, folder?: string, profile?: ProfileReference): Promise<string | undefined>;
  rename(id: string, name: string): Promise<boolean>;
  pin(id: string, isPinned: boolean): Promise<boolean>;
  archive(id: string, isArchived: boolean): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  getArchived(): Promise<ArchivedChatSummary[]>;
  exportMarkdown(id: string): Promise<string | undefined>;
}

/** Keeps independent chat runs and reopens saved chats through Pi. */
export async function createChat({ models, directory, folder }: ChatOptions): Promise<Chat> {
  const sessionDirectory = join(directory, "sessions");
  const savedChats = await createSavedChats(sessionDirectory, join(directory, "pinned-chats.json"));
  const startFolder = toFolder(folder);
  const existingChats = [...(await savedChats.list()), ...(await savedChats.listArchived())];
  const profiles = await createProfileStore(
    directory,
    [...new Set([startFolder, ...existingChats.map((saved) => toFolder(saved.cwd || folder))])],
    existingChats.map((saved) => {
      return {
        id: saved.id,
        folder: toFolder(saved.cwd || folder),
        overrides: chatOverridesOf(SessionManager.open(saved.path, sessionDirectory)),
      };
    }),
  );
  const outputFolder = join(directory, "outputs");
  const savedRequests = createSavedRequests(join(directory, "requests"));
  const commandStops = new Map<string, () => Promise<void>>();
  const commandHandBacks = new Map<string, () => void>();
  const background = createBackgroundCommands({
    onProgress(chatId, toolCallId, progress) {
      const run = runs.get(chatId);
      if (run !== undefined) {
        emitFor(run, { type: "toolProgress", id: toolCallId, details: progress });
      }
    },
    onEnd: noteEnd,
  });
  function toolsFor(configuration: ResolvedProfile): ToolDefinition[] {
    const settings = { get: () => configuration.settings };
    const texts = createModelTexts(() => configuration.settings.texts);
    const shell = findShell(configuration.settings.shell ?? undefined);
    return [
      createReadTool({ getLimits: () => settings.get().outputLimits, texts }),
      createWriteTool(texts),
      createEditTool(texts),
      createShellTool({
        getShell: () => shell,
        getLimits: () => settings.get().outputLimits,
        getEnvironment: () => settings.get().environment,
        getHandBackSeconds: () => settings.get().handBackSeconds,
        handBacks: commandHandBacks,
        texts,
        outputFolder,
        stops: commandStops,
        background,
      }),
      createCheckCommandTool(background, texts),
      createStopCommandTool(background, texts),
    ];
  }
  const listeners = new Set<(event: ChatsEvent) => void>();
  const runs = new Map<string, ChatRun>();
  const stoppingChats = new Set<string>();
  const pendingOpens = new Map<string, Promise<ChatRun | undefined>>();
  // Pi keeps setup entries in memory until the first message, so an empty chat keeps its manager
  // when its agent session is released.
  const drafts = new Map<
    string,
    {
      manager: SessionManager;
      folder: string;
    }
  >();
  profiles.subscribe(() => {
    reconcile().catch(() => undefined);
  });
  let firstId: string | undefined;
  let firstOpening: Promise<string> | undefined;

  function emit(event: ChatsEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function emitFor(run: ChatRun, event: ChatEvent): void {
    for (const listener of run.listeners) {
      listener(event);
    }
  }

  function getState(run: ChatRun): ChatState {
    const session = run.session;
    const model = run.isModelChosen ? session.model : undefined;
    const savedTimes = readThinkingTimes(run);
    const streaming = run.isReplying ? session.agent.state.streamingMessage : undefined;
    return {
      id: session.sessionId,
      folder: run.folder,
      model: model === undefined ? null : { providerId: model.provider, id: model.id },
      // Pi offers only the levels that the model supports, and none for a model that cannot think.
      thinking:
        model === undefined || !session.supportsThinking()
          ? null
          : { level: session.thinkingLevel, levels: session.getAvailableThinkingLevels() },
      messages: chatMessagesOf(session.messages ?? [], savedTimes),
      isReplying: run.isReplying ?? false,
      reply:
        streaming?.role === "assistant" ? partsOf(streaming.content, timesOf(run, streaming)) : [],
      toolRuns: { ...run.toolRuns },
      isCompacting: run.isCompacting ?? false,
      compactionError: run.compactionError ?? null,
      contextVersion: run.contextVersion ?? 0,
      backgroundCommands: session === undefined ? [] : background.listRunning(session.sessionId),
    };
  }

  function getReplyingIds(): string[] {
    return [...runs.values()].filter((run) => run.isReplying).map((run) => run.session.sessionId);
  }

  // A run stays alive while a request or a follower holds it, while it replies, or while a
  // background command runs.
  function releaseIfIdle(run: ChatRun): void {
    if (
      run.rebuilding !== undefined ||
      run.users > 0 ||
      run.isClosing ||
      run.listeners.size > 0 ||
      run.isReplying ||
      run.isCompacting ||
      run.pendingNotes > 0 ||
      stoppingChats.has(run.session.sessionId) ||
      background.listRunning(run.session.sessionId).length > 0
    ) {
      return;
    }
    if (
      !run.session.messages.some(
        (message) => message.role === "user" || message.role === "assistant",
      )
    ) {
      drafts.set(run.session.sessionId, {
        manager: run.session.sessionManager,
        folder: run.folder,
      });
    } else {
      drafts.delete(run.session.sessionId);
    }
    run.stopFollowing();
    run.session.dispose();
    runs.delete(run.session.sessionId);
  }

  // A background command that ends wakes the agent of its chat with a note of how it ended, also
  // when the chat runs without being open. A chat whose session has gone keeps the note for its
  // next turn. A command that the model stopped, or waited on with CheckCommand, needs no note,
  // because the result of that tool says how it ended.
  function noteEnd(ended: BackgroundEnded): void {
    if (stoppingChats.has(ended.chatId)) {
      return;
    }
    const run = runs.get(ended.chatId);
    if (run?.isClosing === true) {
      return;
    }
    if (run !== undefined) {
      emitFor(run, { type: "commandEnd", end: ended.end });
    }
    if (ended.isSeenByModel) {
      if (run !== undefined) {
        releaseIfIdle(run);
      }
      return;
    }
    const note = {
      customType: commandEndType,
      content: describeBackgroundNote(ended, ended.texts),
      display: true,
      details: ended.end,
    };
    if (run !== undefined) {
      run.pendingNotes += 1;
      deliverNote(run, note)
        .catch(() => undefined)
        .finally(() => {
          run.pendingNotes -= 1;
          releaseIfIdle(run);
        });
    } else {
      findSaved(ended.chatId).then(
        (saved) => {
          if (saved !== undefined) {
            SessionManager.open(saved.path, sessionDirectory).appendCustomMessageEntry(
              note.customType,
              note.content,
              note.display,
              note.details,
            );
          }
        },
        () => undefined,
      );
    }
  }

  async function deliverNote(
    run: ChatRun,
    note: Parameters<AgentSession["sendCustomMessage"]>[0],
  ): Promise<void> {
    if (run.isCompacting && !run.isReplying) {
      await run.session.waitForIdle();
    }
    if (
      runs.get(run.session.sessionId) === run &&
      !run.isClosing &&
      !stoppingChats.has(run.session.sessionId)
    ) {
      await reconcileRun(run);
      if (!run.isModelChosen || configurationIssues(run).length > 0) {
        run.session.sessionManager.appendCustomMessageEntry(
          note.customType,
          note.content,
          note.display,
          note.details,
        );
        return;
      }
      await run.session.sendCustomMessage(note, { triggerTurn: true, deliverAs: "steer" });
    }
  }

  function readThinkingTimes(run: ChatRun): Map<number, (number | null)[]> {
    const times = new Map<number, (number | null)[]>();
    for (const entry of run.session.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === thinkingTimesType) {
        const saved = entry.data as ThinkingTimes;
        times.set(saved.timestamp, saved.durationsMs);
      }
    }
    return times;
  }

  // Pi streams each part of a reply by its place in the message, so the UI builds the reply in
  // progress the same way.
  function showUpdate(run: ChatRun, update: ReplyUpdate): void {
    if (update.type === "text_delta" || update.type === "thinking_delta") {
      emitFor(run, {
        type: "replyDelta",
        index: update.contentIndex,
        partType: update.type === "text_delta" ? "text" : "thinking",
        delta: update.delta,
      });
    } else if (update.type === "thinking_start" || update.type === "thinking_end") {
      if (update.type === "thinking_start") {
        run.thinkingStarts.set(update.contentIndex, performance.now());
      } else {
        const start = run.thinkingStarts.get(update.contentIndex) ?? performance.now();
        run.thinkingTimes.set(update.contentIndex, Math.round(performance.now() - start));
      }
      const block = update.partial.content[update.contentIndex];
      if (block?.type === "thinking") {
        emitFor(run, {
          type: "replyPart",
          index: update.contentIndex,
          part: thinkingPartOf(block, run.thinkingTimes.get(update.contentIndex) ?? null),
        });
      }
    } else if (
      update.type === "toolcall_start" ||
      update.type === "toolcall_delta" ||
      update.type === "toolcall_end"
    ) {
      showCall(run, update);
    }
  }

  // Pi reads the arguments of a call as they stream, so the chat shows the call as it is written.
  function showCall(
    run: ChatRun,
    update: Extract<ReplyUpdate, { type: "toolcall_start" | "toolcall_delta" | "toolcall_end" }>,
  ): void {
    const now = performance.now();
    if (update.type === "toolcall_delta" && now - run.lastCallUpdate < callUpdateInterval) {
      return;
    }
    run.lastCallUpdate = now;
    const block =
      update.type === "toolcall_end"
        ? update.toolCall
        : update.partial.content[update.contentIndex];
    if (block?.type === "toolCall") {
      emitFor(run, { type: "replyPart", index: update.contentIndex, part: toolCallPartOf(block) });
    }
  }

  function timesOf(run: ChatRun, message: AgentMessage): (number | null)[] {
    return message.role === "assistant"
      ? message.content.map((_, index) => run.thinkingTimes.get(index) ?? null)
      : [];
  }

  // A turn ends once Pi has saved its reply and the results of its tools, so the times follow them
  // and never land between a tool call and its result.
  function saveThinkingTimes(run: ChatRun, message: AgentMessage): void {
    if (message.role === "assistant" && run.thinkingTimes.size > 0) {
      const saved: ThinkingTimes = {
        timestamp: message.timestamp,
        durationsMs: timesOf(run, message),
      };
      run.session.sessionManager.appendCustomEntry(thinkingTimesType, saved);
    }
  }

  // The last reply of a chat, as a notification of its end says it.
  function lastReplyOf(run: ChatRun): ChatMessage | null {
    return (
      chatMessagesOf(run.session.messages, readThinkingTimes(run)).findLast(
        (message) => message.role === "assistant",
      ) ?? null
    );
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

  // Pi stops writing before a chat file moves or goes away. Each follower receives an empty
  // replacement in the same folder, with the same model.
  async function leave(saved: SessionInfo): Promise<void> {
    if (saved.id === firstId) {
      firstId = undefined;
      firstOpening = undefined;
    }
    const run = runs.get(saved.id) ?? (await pendingOpens.get(saved.id));
    if (run === undefined) {
      return;
    }
    run.isClosing = true;
    stoppingChats.add(saved.id);
    try {
      await Promise.all([run.session.abort(), background.stopAll(saved.id)]);
    } finally {
      stoppingChats.delete(saved.id);
    }
    if (run.listeners.size > 0) {
      const replacement = await openNew(folderOf(saved));
      emitFor(run, { type: "removed", replacementId: replacement.session.sessionId });
      releaseIfIdle(replacement);
    }
    runs.delete(saved.id);
    drafts.delete(saved.id);
    run.stopFollowing();
    run.session.dispose();
    emit({ type: "replyingChats", ids: getReplyingIds() });
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

  function setReplying(run: ChatRun, isReplying: boolean): void {
    run.isReplying = isReplying;
    emitFor(run, { type: "replying", isReplying });
    emit({ type: "replyingChats", ids: getReplyingIds() });
  }

  // A reply ends for every chat, open or not, so the UI can say so while the user looks elsewhere.
  function endReply(run: ChatRun, reply: ChatMessage | null): void {
    setReplying(run, false);
    emit({ type: "replyEnded", chatId: run.session.sessionId, reply });
    emitProjects();
    releaseIfIdle(run);
  }

  // Pi saves a chat with its first message and touches it again after every reply, so the projects
  // follow both.
  function followRun(run: ChatRun): (event: AgentSessionEvent) => void {
    return (event) => {
      if (event.type === "compaction_start") {
        run.isCompacting = true;
        run.compactionError = null;
        refreshContext(run);
      } else if (event.type === "compaction_end") {
        run.isCompacting = false;
        run.compactionError = event.errorMessage ?? null;
        refreshContext(run);
        releaseIfIdle(run);
        setImmediate(() => {
          reconcileRun(run).catch(() => undefined);
        });
      } else if (event.type === "agent_start") {
        setReplying(run, true);
      } else if (event.type === "agent_settled") {
        endReply(run, lastReplyOf(run));
        setImmediate(() => {
          reconcileRun(run).catch(() => undefined);
        });
      } else if (event.type === "message_start" && event.message.role === "assistant") {
        run.thinkingStarts.clear();
        run.thinkingTimes.clear();
      } else if (event.type === "message_update") {
        showUpdate(run, event.assistantMessageEvent);
      } else if (event.type === "turn_end") {
        saveThinkingTimes(run, event.message);
      } else if (event.type === "tool_execution_start") {
        run.toolRuns[event.toolCallId] = { startedAt: Date.now(), details: null };
        emitFor(run, { type: "toolStart", id: event.toolCallId });
      } else if (event.type === "tool_execution_update") {
        const details = event.partialResult?.details ?? null;
        run.toolRuns[event.toolCallId] = {
          startedAt: run.toolRuns[event.toolCallId]?.startedAt ?? Date.now(),
          details,
        };
        emitFor(run, {
          type: "toolProgress",
          id: event.toolCallId,
          details,
        });
      } else if (event.type === "tool_execution_end") {
        delete run.toolRuns[event.toolCallId];
      } else if (event.type === "message_end" && event.message.role === "toolResult") {
        emitFor(run, {
          type: "toolResult",
          id: event.message.toolCallId,
          result: toolResultOf(event.message),
        });
      } else if (event.type === "message_end") {
        const message = toChatMessage(event.message, timesOf(run, event.message));
        if (message !== undefined) {
          emitFor(run, { type: "message", message });
        }
        // Pi tells its listeners about a message before it saves it, so the projects wait one turn
        // of the event loop. When they are read sooner, a new chat stays out of its project until
        // the reply ends.
        if (event.message.role === "user") {
          setImmediate(emitProjects);
        }
      }
    };
  }

  async function openSaved(saved: SessionInfo): Promise<ChatRun> {
    const manager = SessionManager.open(saved.path, sessionDirectory);
    if (profiles.choices(saved.id).revision === configurationRevision([null])) {
      profiles.keepChoices(saved.id, {
        ...profiles.newChoices(folderOf(saved)),
        overrides: chatOverridesOf(manager),
      });
      await profiles.saveChoices(saved.id);
    }
    return openSession(manager, folderOf(saved));
  }

  function openNew(
    newFolder: string,
    profile?: ProfileReference,
    source?: ChatRun,
  ): Promise<ChatRun> {
    const manager = SessionManager.create(newFolder, sessionDirectory);
    const choices = profiles.newChoices(newFolder, profile);
    // A new chat started from another keeps its model and effort while both use one profile, as
    // decision 0058 says.
    const isSameProfile =
      source !== undefined &&
      source.configuration.choices.document?.profile.scope === choices.profile.scope &&
      source.configuration.choices.document?.profile.id === choices.profile.id;
    const model = source?.isModelChosen === true ? source.session.model : undefined;
    profiles.keepChoices(
      manager.getSessionId(),
      isSameProfile && model !== undefined
        ? {
            ...choices,
            overrides: {
              model: { providerId: model.provider, modelId: model.id },
              thinkingLevel: source.session.thinkingLevel,
            },
          }
        : choices,
    );
    return openSession(manager, newFolder);
  }

  async function loadRun(id: string): Promise<ChatRun | undefined> {
    const draft = drafts.get(id);
    if (draft !== undefined) {
      return openSession(draft.manager, draft.folder);
    }
    const saved = await findSaved(id);
    return saved === undefined ? undefined : openSaved(saved);
  }

  async function acquire(id: string): Promise<ChatRun | undefined> {
    let pending = pendingOpens.get(id);
    if (pending === undefined) {
      const running = runs.get(id);
      pending = running === undefined ? loadRun(id) : Promise.resolve(running);
      pendingOpens.set(id, pending);
    }
    try {
      const run = await pending;
      if (run !== undefined) {
        run.users += 1;
      }
      return run;
    } finally {
      pendingOpens.delete(id);
    }
  }

  function close(run: ChatRun): void {
    run.users -= 1;
    releaseIfIdle(run);
  }

  async function openSession(
    manager: SessionManager,
    sessionFolder: string,
    previous?: ChatRun,
    applied?: ResolvedProfile,
  ): Promise<ChatRun> {
    const configuration = applied ?? profiles.resolve(manager.getSessionId(), sessionFolder);
    if (applied === undefined) {
      checkModels(configuration);
    }
    const settings = { get: () => configuration.settings };
    const texts = createModelTexts(() => configuration.settings.texts);
    const ownTools = toolsFor(configuration);
    const model = modelFor(configuration.model);
    const isChosen = model !== undefined && models.hasConfiguredAuth(model.provider);
    const thinkingLevel = configuration.thinkingLevel ?? "medium";
    // The hidden extension of the chat registers anew whenever Pi loads it, and its handlers find
    // the run of their chat once it exists.
    const hold: { run?: ChatRun; extension?: ExtensionAPI } = {};
    // Without its own settings and an empty addendum, Pi reads its settings from the project and
    // from `~/.independum`, and adds any `APPEND_SYSTEM.md` there to the system prompt, so a file
    // in a project could reach the model unseen.
    const piSettings = SettingsManager.inMemory({
      compaction: piCompactionSettings(configuration.settings),
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd: sessionFolder,
      agentDir: directory,
      settingsManager: piSettings,
      // Pi reads a prompt that names a file as that file, so the prompt that the user edits reaches
      // Pi before each turn instead, and this one is only where Pi starts.
      systemPrompt: systemPromptText.builtIn,
      appendSystemPrompt: [],
      noExtensions: true,
      noContextFiles: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      // This hidden extension registers Independum's tools and sets the prompt of the user before
      // each turn. Pi hands it every request before sending it, and it keeps a copy for the Context
      // place and leaves the request as it is. Pi says when it is about to send a request again
      // only to keep the cache of the provider warm, and such a request counts apart.
      extensionFactories: [
        {
          name: "independum",
          hidden: true,
          factory: (pi) => {
            hold.extension = pi;
            if (hold.run !== undefined) {
              hold.run.extension = pi;
            }
            let isWarming = false;
            for (const tool of ownTools) {
              pi.registerTool(tool);
            }
            pi.on("before_agent_start", (event, context) => {
              event.systemPromptOptions.customPrompt = texts.get(systemPromptText);
              const facts = addedFactPrompt({
                settings: settings.get(),
                folder: sessionFolder,
                model: context.model,
              });
              return {
                systemPrompt: [texts.get(systemPromptText), facts]
                  .filter((text) => text !== "")
                  .join("\n\n"),
              };
            });
            pi.on("context", (event) => ({
              messages: addMessageTimes(event.messages, settings.get()),
            }));
            pi.on("cache_warming_decision", (event) => {
              isWarming = event.action === "warm";
            });
            pi.on("before_provider_request", (event) => {
              const { run } = hold;
              if (run === undefined) {
                return;
              }
              if (isWarming) {
                isWarming = false;
                run.cacheWarmings += 1;
              } else {
                run.lastRequest = event.payload;
                savedRequests.save(run.session.sessionId, event.payload);
              }
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
      settingsManager: piSettings,
      ...(model === undefined ? {} : { model }),
      ...(thinkingLevel === undefined ? {} : { thinkingLevel }),
    });
    const { session } = created;
    const run: ChatRun = Object.assign(previous ?? {}, {
      session,
      extension: hold.extension,
      folder: sessionFolder,
      stopFollowing: () => undefined,
      // Pi picks a provider default for a new chat without a model, and for a saved chat whose
      // model has lost its login. The user chose neither.
      isModelChosen:
        session.model !== undefined && created.modelFallbackMessage === undefined && isChosen,
      isReplying: false,
      isCompacting: false,
      compactionError: null,
      contextVersion: previous?.contextVersion ?? 0,
      pendingNotes: previous?.pendingNotes ?? 0,
      lastRequest: previous?.lastRequest ?? savedRequests.read(session.sessionId),
      cacheWarmings: 0,
      thinkingStarts: new Map(),
      thinkingTimes: new Map(),
      lastCallUpdate: 0,
      toolRuns: {},
      listeners: previous?.listeners ?? new Set<(event: ChatEvent) => void>(),
      users: previous?.users ?? 0,
      isClosing: false,
      configuration,
      desired: undefined,
      rebuilding: previous?.rebuilding,
      ownTools,
    });
    hold.run = run;
    applySessionSettings(session, configuration.settings);
    const stream = session.agent.streamFunction;
    function streamWithOverrides(
      ...[requestModel, context, options]: Parameters<typeof stream>
    ): ReturnType<typeof stream> {
      const overrides =
        settings.get().modelOverrides[requestModel.provider]?.[requestModel.id] ?? {};
      return stream(applyModelOverrides(requestModel, overrides), context, {
        ...options,
        ...(overrides.maxOutput === undefined
          ? {}
          : {
              maxTokens: Math.min(options?.maxTokens ?? overrides.maxOutput, overrides.maxOutput),
            }),
        // Pi merges sampling parameters after named options, so a catalog temperature must change too.
        ...(overrides.temperature === undefined
          ? {}
          : {
              temperature: overrides.temperature,
              samplingParams: { ...options?.samplingParams, temperature: overrides.temperature },
            }),
      });
    }
    session.agent.streamFunction = streamWithOverrides;
    session.setActiveToolsByName(activeToolNames(run));
    run.stopFollowing = session.subscribe(followRun(run));
    runs.set(session.sessionId, run);
    return run;
  }

  // The exact prompt override keeps Pi's folder section out of requests, so its folder fact has
  // the same switch and edit controls as the other facts.
  function getAgent(run: ChatRun): AgentSummary {
    const agent = summarizeAgent(
      run.configuration,
      run.folder,
      run.isModelChosen ? run.session.model : undefined,
      run.lastRequest,
    );
    if (agent.configuration !== undefined && run.desired !== undefined) {
      agent.configuration.pendingRevision =
        run.desired.effectiveRevision === run.configuration.effectiveRevision
          ? null
          : run.desired.effectiveRevision;
      agent.configuration.issues = run.desired.issues;
    }
    return agent;
  }

  function summarizeAgent(
    configuration: ResolvedProfile,
    folder: string,
    selected: Model | undefined,
    lastRequest: unknown,
  ): AgentSummary {
    const settings = { get: () => configuration.settings };
    const texts = createModelTexts(() => configuration.settings.texts);
    const ownTools = toolsFor(configuration);
    const prompt = texts.get(systemPromptText);
    const model =
      selected === undefined ? undefined : models.getModel(selected.provider, selected.id);
    return {
      configuration: {
        profile: configuration.profile,
        choices: configuration.choices,
        model: configuration.model ?? null,
        thinkingLevel: configuration.thinkingLevel,
        appliedRevision: configuration.effectiveRevision,
        pendingRevision: null,
        issues: configuration.issues,
        sources: configuration.sources,
        userSettings: configuration.userSettings,
      },
      modelSettings:
        model === undefined
          ? null
          : modelSettingsOf(model, settings.get().modelOverrides[model.provider]?.[model.id]),
      compaction: settings.get().compaction,
      builtInCompaction: builtInSettings.compaction,
      systemPrompt: prompt,
      addedByPi: "",
      addedFacts: summarizeAddedFacts({
        settings: settings.get(),
        folder,
        model: selected,
      }),
      knowledgeCutoffs: settings.get().knowledgeCutoffs,
      tools: ownTools.map(
        (tool): ToolSummary => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          isEnabled: !settings.get().disabledTools.includes(tool.name),
          unavailable: unavailableOf(tool.name, configuration.settings),
        }),
      ),
      shells: shellKinds.map(
        (kind): ShellChoice => ({
          kind,
          name: findShell(kind)?.name ?? null,
          missing: missingShellOf(kind),
          isChosen: kind === (settings.get().shell ?? defaultShellKind()),
        }),
      ),
      chosenShell: settings.get().shell === defaultShellKind() ? null : settings.get().shell,
      outputLimits: settings.get().outputLimits,
      builtInOutputLimits: builtInSettings.outputLimits,
      handBackSeconds: settings.get().handBackSeconds,
      builtInHandBackSeconds: builtInSettings.handBackSeconds,
      texts: summarizeTexts(allTexts, settings.get().texts),
      piTexts: summarizePiTexts(lastRequest ?? null),
      environment: settings.get().environment,
      environmentSuggestions,
    };
  }

  function ownToolInfos(run: ChatRun): ReturnType<AgentSession["getAllTools"]> {
    return run.session
      .getAllTools()
      .filter((tool) => run.ownTools.some((own) => own.name === tool.name));
  }

  // A tool runs only when the user has not turned it off and it can run on this computer.
  function activeToolNames(run: ChatRun): string[] {
    return ownToolInfos(run)
      .map((tool) => tool.name)
      .filter(
        (name) =>
          !run.configuration.settings.disabledTools.includes(name) &&
          unavailableOf(name, run.configuration.settings) === null,
      );
  }

  function unavailableOf(toolName: string, settings: Settings): string | null {
    if (toolName !== "Shell" || findShell(settings.shell ?? undefined) !== undefined) {
      return null;
    }
    return missingShellOf(settings.shell ?? defaultShellKind());
  }

  // A change names model texts by their ids, so one that names a text that does not exist is
  // refused whole. Pi reads the tools again when Independum registers them anew, so a new shell or
  // an edited text reaches the model with the next turn of every chat that runs.
  async function changeSettings(
    reference: ProfileReference,
    projectId: string,
    change: SettingsChange,
    revision: string | undefined,
  ): Promise<boolean> {
    const resource = profiles.profile(reference, projectId);
    const bundle = resource.document;
    if (bundle === null) {
      return false;
    }
    const settings = profiles.preview(reference, projectId).settings;
    const {
      texts: textChange,
      modelOverrides: modelChanges,
      compaction: compactionChange,
      knowledgeCutoffs,
      tool,
      ...rest
    } = change;
    if (knowledgeCutoffs !== undefined) {
      return false;
    }
    if (rest.shell === defaultShellKind()) {
      rest.shell = null;
    }
    const modelOverrides =
      modelChanges === undefined
        ? settings.modelOverrides
        : changeModelOverrides(models, settings.modelOverrides, modelChanges);
    const edited =
      textChange === undefined ? settings.texts : changeTexts(allTexts, settings.texts, textChange);
    if (edited === undefined || modelOverrides === undefined) {
      return false;
    }
    const disabledTools =
      tool === undefined
        ? (rest.disabledTools ?? settings.disabledTools)
        : [
            ...settings.disabledTools.filter((name) => name !== tool.name),
            ...(tool.isEnabled ? [] : [tool.name]),
          ];
    const { systemPrompt, ...texts } = edited;
    const next = {
      ...bundle,
      profile: {
        ...bundle.profile,
        settings: {
          ...bundle.profile.settings,
          ...rest,
          disabledTools,
          modelOverrides,
          compaction: { ...settings.compaction, ...compactionChange },
        },
      },
      systemPrompt: systemPrompt?.text ?? null,
      modelTexts: {
        formatVersion: 1,
        texts,
        ...(systemPrompt?.builtIn === undefined
          ? {}
          : { systemPromptBuiltIn: systemPrompt.builtIn }),
      },
    };
    await profiles.putProfile(reference, projectId, next, revision);
    await reconcile();
    return true;
  }

  function piCompactionSettings(
    settings: Settings,
  ): ReturnType<SettingsManager["getCompactionSettings"]> {
    const { isEnabled, reserveTokens, keepRecentTokens } = settings.compaction;
    return { enabled: isEnabled, reserveTokens, keepRecentTokens };
  }

  function applySessionSettings(session: AgentSession, settings: Settings): void {
    const selected = session.model;
    const model =
      selected === undefined ? undefined : models.getModel(selected.provider, selected.id);
    if (model !== undefined) {
      session.agent.state.model = applyModelOverrides(
        model,
        settings.modelOverrides[model.provider]?.[model.id] ?? {},
      );
    }
  }

  function configurationIssues(run: ChatRun): ConfigurationIssue[] {
    return (run.desired ?? run.configuration).issues;
  }

  function modelFor(choice: ChatOverrides["model"]): Model | undefined {
    return choice == null ? undefined : models.getModel(choice.providerId, choice.modelId);
  }

  function checkModels(configuration: ResolvedProfile): void {
    const choice = configuration.model;
    const model = modelFor(choice);
    if (choice != null && (model === undefined || !models.hasConfiguredAuth(choice.providerId))) {
      const source = configuration.sources.model;
      configuration.issues.push({
        file: source?.file ?? configuration.profile.path,
        pointer: source?.pointer ?? "/settings/model",
        message:
          model === undefined
            ? "This provider and model are not in the Pi catalog."
            : "The selected provider needs a login.",
      });
    }
    if (
      model !== undefined &&
      configuration.thinkingLevel != null &&
      !getSupportedThinkingLevels(model).includes(configuration.thinkingLevel)
    ) {
      const source = configuration.sources.thinkingLevel;
      configuration.issues.push({
        file: source?.file ?? configuration.profile.path,
        pointer: source?.pointer ?? "/settings/thinkingLevel",
        message: "The selected model does not support this explicit thinking level.",
      });
    }
    for (const [provider, overrides] of Object.entries(configuration.settings.modelOverrides)) {
      for (const id of Object.keys(overrides)) {
        if (models.getModel(provider, id) === undefined) {
          configuration.issues.push({
            file: join(configuration.profile.path, "profile.json"),
            pointer: [
              "",
              "settings",
              "modelOverrides",
              escapePointer(provider),
              escapePointer(id),
            ].join("/"),
            message: "This override names a model that is not in the Pi catalog.",
          });
        }
      }
    }
  }

  async function reconcileRun(run: ChatRun): Promise<void> {
    if (runs.get(run.session.sessionId) !== run || run.isClosing) {
      return;
    }
    if (run.rebuilding !== undefined) {
      await run.rebuilding;
      return reconcileRun(run);
    }
    const desired = profiles.resolve(run.session.sessionId, run.folder);
    checkModels(desired);
    const previous = run.desired ?? run.configuration;
    const hasChanged =
      previous.profile.revision !== desired.profile.revision ||
      previous.choices.revision !== desired.choices.revision ||
      previous.effectiveRevision !== desired.effectiveRevision ||
      JSON.stringify(previous.issues) !== JSON.stringify(desired.issues);
    run.desired = desired;
    if (
      desired.issues.length === 0 &&
      desired.effectiveRevision !== run.configuration.effectiveRevision &&
      !run.isReplying &&
      !run.isCompacting &&
      !run.isClosing
    ) {
      const session = run.session;
      const stopFollowing = run.stopFollowing;
      run.users += 1;
      run.rebuilding = (async () => {
        await openSession(session.sessionManager, run.folder, run, desired);
        stopFollowing();
        session.dispose();
        run.session.sessionManager.appendCustomEntry("independum-profile", {
          profile: desired.profile.reference,
          revision: desired.effectiveRevision,
        });
      })();
      try {
        await run.rebuilding;
      } finally {
        run.rebuilding = undefined;
        run.users -= 1;
      }
      await reconcileRun(run);
      emitFor(run, { type: "state", state: getState(run) });
    } else if (
      desired.issues.length === 0 &&
      desired.effectiveRevision === run.configuration.effectiveRevision
    ) {
      run.configuration = desired;
      run.desired = undefined;
    }
    if (hasChanged) {
      refreshContext(run);
    }
  }

  async function reconcile(): Promise<void> {
    for (const run of runs.values()) {
      await reconcileRun(run);
    }
  }

  function refreshContext(run: ChatRun): void {
    run.contextVersion += 1;
    const { contextVersion, isCompacting, compactionError } = run;
    emitFor(run, {
      type: "contextChanged",
      state: { contextVersion, isCompacting, compactionError },
    });
  }

  function canStart(run: ChatRun | undefined): run is ChatRun {
    return (
      run?.isModelChosen === true &&
      !run.isReplying &&
      !run.isCompacting &&
      run.rebuilding === undefined &&
      configurationIssues(run).length === 0
    );
  }

  // Pi counts the tokens and the cost of every saved reply, and estimates how full the context
  // window is from the latest one. It leaves reasoning tokens out of its sums, so they are added here
  // over the same entries.
  function getContext(run: ChatRun): ContextSummary {
    const session = run.session;
    const lastRequest = run.lastRequest ?? null;
    const stats = session.getSessionStats();
    const usage = session.getContextUsage();
    const model = run.isModelChosen === true ? session.model : undefined;
    let reasoning = 0;
    for (const entry of session.sessionManager.getEntries() ?? []) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        reasoning += entry.message.usage.reasoning ?? 0;
      }
    }
    const branch = session.sessionManager.getBranch() ?? [];
    let lastUse: ContextSummary["lastUse"] = null;
    for (const entry of branch.toReversed()) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        const { usage } = entry.message;
        lastUse ??= {
          tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
          cost: 0,
        };
        lastUse.tokens.input += usage.input;
        lastUse.tokens.output += usage.output;
        lastUse.tokens.reasoning += usage.reasoning ?? 0;
        lastUse.tokens.cacheRead += usage.cacheRead;
        lastUse.tokens.cacheWrite += usage.cacheWrite;
        lastUse.cost += usage.cost.total;
      } else if (
        lastUse !== null &&
        (entry.type === "custom_message" ||
          (entry.type === "message" && entry.message.role === "user"))
      ) {
        break;
      }
    }
    const agent = getAgent(run);
    return {
      chatId: session.sessionId ?? null,
      provider: model?.provider ?? null,
      model: model?.id ?? null,
      contextWindow: usage?.contextWindow ?? null,
      contextTokens: usage?.tokens ?? null,
      compactionReserve:
        session.settingsManager.getCompactionEnabled() === true
          ? session.settingsManager.getCompactionReserveTokens(model)
          : null,
      tokens: {
        input: stats.tokens.input ?? 0,
        output: stats.tokens.output ?? 0,
        reasoning,
        cacheRead: stats.tokens.cacheRead ?? 0,
        cacheWrite: stats.tokens.cacheWrite ?? 0,
      },
      cost: stats.cost ?? 0,
      lastUse,
      userMessages: stats.userMessages ?? 0,
      assistantMessages: stats.assistantMessages ?? 0,
      toolCalls: stats.toolCalls ?? 0,
      created: session.sessionManager.getHeader()?.timestamp ?? null,
      lastActivity: branch.at(-1)?.timestamp ?? null,
      entries: branch.map((entry) => ({
        id: entry.id,
        type: entry.type,
        role: entry.type === "message" ? entry.message.role : null,
        timestamp: entry.timestamp,
        data:
          entry.type === "message" && entry.message.role === "toolResult"
            ? {
                ...entry,
                message: { ...entry.message, details: withoutFingerprint(entry.message.details) },
              }
            : entry,
      })),
      lastRequest,
      requestParts:
        lastRequest === null
          ? describeNextRequest(nextKnownTexts(agent, branch))
          : summarizeRequest(lastRequest, {
              systemPrompt: agent.systemPrompt,
              addedByPi: agent.addedByPi,
              addedFacts: knownFacts(agent, branch),
              tools: agent.tools,
              entries: branch.flatMap((entry) =>
                entry.type === "message" || entry.type === "custom_message"
                  ? [
                      {
                        id: entry.id,
                        message:
                          entry.type === "message"
                            ? entry.message
                            : { role: "custom", content: entry.content },
                      },
                    ]
                  : [],
              ),
            }),
      isNextRequest: lastRequest === null,
      ...listRequests(branch),
      files: {
        chat: session.sessionFile ?? null,
        toolOutput: join(outputFolder, session.sessionId),
        savedRequest: savedRequests.pathOf(session.sessionId),
      },
      cacheWarmings: run.cacheWarmings ?? 0,
    };
  }

  // Before a chat sends a request, its next one holds the tools that are on and the messages that
  // Pi builds from the chat, such as a summary in place of compacted messages. Each message keeps
  // the id of its saved entry where Pi sends that entry as it is.
  function nextKnownTexts(agent: AgentSummary, branch: SessionEntry[]): KnownTexts {
    const messages = buildSessionContext(branch).messages;
    return {
      systemPrompt: agent.systemPrompt,
      addedByPi: agent.addedByPi,
      addedFacts: knownFacts(agent, branch).filter((fact) =>
        agent.addedFacts.some((each) => each.id === fact.id && each.isEnabled),
      ),
      tools: agent.tools.filter((tool) => tool.isEnabled),
      entries: messages.map((message, index) => ({
        id:
          branch.find((entry) => entry.type === "message" && entry.message === message)?.id ??
          `context-${index}`,
        message,
      })),
    };
  }

  function knownFacts(
    agent: AgentSummary,
    branch: SessionEntry[],
  ): NonNullable<KnownTexts["addedFacts"]> {
    return [
      ...agent.addedFacts
        .filter((fact) => fact.id !== "facts.messageTime" && fact.text !== null)
        .map((fact) => ({
          id: fact.id,
          label: fact.label,
          text: fact.text ?? "",
          group: "instructions" as const,
        })),
      ...branch.flatMap((entry) =>
        entry.type === "message" &&
        (entry.message.role === "user" || entry.message.role === "toolResult")
          ? [
              {
                id: "facts.messageTime",
                label: "Message time",
                text: messageTimeText(entry.message.timestamp, {
                  ...builtInSettings,
                  texts: Object.fromEntries(
                    agent.texts.map((text) => [text.id, { text: text.text }]),
                  ),
                }),
                group: "messages" as const,
                entryId: entry.id,
              },
            ]
          : [],
      ),
    ];
  }

  async function changeChoices(run: ChatRun, overrides: ChatOverrides): Promise<boolean> {
    const choices = profiles.choices(run.session.sessionId);
    if (choices.document === null) {
      return false;
    }
    await profiles.putChoices({
      id: run.session.sessionId,
      folder: run.folder,
      value: { ...choices.document, overrides: { ...choices.document.overrides, ...overrides } },
      revision: choices.revision,
      isDurable: run.session.messages.length > 0,
    });
    await reconcileRun(run);
    emitFor(run, { type: "state", state: getState(run) });
    return true;
  }

  function handleOf(run: ChatRun): OpenChat {
    let isClosed = false;
    return {
      getState: () => getState(run),
      getAgent: () => getAgent(run),
      getContext: () => getContext(run),
      close() {
        if (!isClosed) {
          isClosed = true;
          close(run);
        }
      },
      subscribe(listener) {
        run.listeners.add(listener);
        listener({ type: "state", state: getState(run) });
        return () => {
          run.listeners.delete(listener);
          releaseIfIdle(run);
        };
      },
      async send(text) {
        await reconcileRun(run);
        if (run.isClosing || configurationIssues(run).length > 0 || !canStart(run)) {
          return false;
        }
        await profiles.saveChoices(run.session.sessionId);
        setReplying(run, true);
        run.session.prompt(text).catch((error: unknown) => {
          const reply: ChatMessage = {
            role: "assistant",
            parts: [],
            commandEnd: null,
            error: messageOf(error),
            timestamp: Date.now(),
            durationMs: null,
          };
          emitFor(run, { type: "message", message: reply });
          endReply(run, reply);
        });
        return true;
      },
      async chooseModel(providerId, modelId) {
        const model = models.getModel(providerId, modelId);
        if (
          run.isClosing ||
          run.isCompacting ||
          model === undefined ||
          !models.hasConfiguredAuth(model.provider)
        ) {
          return false;
        }
        const thinkingLevel = profiles.resolve(run.session.sessionId, run.folder).thinkingLevel;
        return changeChoices(run, {
          model: { providerId, modelId },
          ...(thinkingLevel != null && !getSupportedThinkingLevels(model).includes(thinkingLevel)
            ? { thinkingLevel: clampThinkingLevel(model, thinkingLevel) }
            : {}),
        });
      },
      async chooseThinking(level) {
        const session = run.session;
        const chosen =
          run.isModelChosen === true && session?.supportsThinking() === true
            ? session.getAvailableThinkingLevels().find((candidate) => candidate === level)
            : undefined;
        if (session === undefined || chosen === undefined) {
          return false;
        }
        return changeChoices(run, { thinkingLevel: chosen });
      },
      async compact() {
        await reconcileRun(run);
        if (run.isClosing || !canStart(run)) {
          return false;
        }
        run.isCompacting = true;
        run.compactionError = null;
        refreshContext(run);
        run.session.compact().catch(() => undefined);
        return true;
      },
      async stop() {
        await run.session.abort();
      },
      stopCommand(id) {
        const stop = commandStops.get(JSON.stringify([run.session.sessionId, id]));
        stop?.();
        return stop !== undefined || background.stopByUser(run.session.sessionId, id);
      },
      moveToBackground(id) {
        const handBack = commandHandBacks.get(JSON.stringify([run.session.sessionId, id]));
        handBack?.();
        return handBack !== undefined;
      },
    };
  }

  return {
    async first() {
      const latest = (await listSaved()).find((saved) => folderOf(saved) === startFolder);
      if (latest !== undefined) {
        return latest.id;
      }
      if (firstOpening === undefined) {
        firstOpening = openNew(startFolder).then((run) => {
          firstId = run.session.sessionId;
          releaseIfIdle(run);
          return firstId;
        });
      }
      return firstOpening;
    },
    getProjects,
    getReplyingIds,
    profiles,
    changeSettings,
    reconcile,
    profileAgent(reference, projectId) {
      const configuration = profiles.preview(reference, projectId);
      checkModels(configuration);
      const model = modelFor(configuration.model);
      return summarizeAgent(
        configuration,
        profiles.projects().find((project) => project.id === projectId)?.folder ?? startFolder,
        model,
        null,
      );
    },
    subscribe(listener) {
      return subscribeTo(listeners, listener);
    },
    async open(id) {
      const run = await acquire(id);
      return run === undefined ? undefined : handleOf(run);
    },
    async rename(id, name) {
      const saved = await findSaved(id);
      const trimmed = name.trim();
      if (saved === undefined || trimmed === "") {
        return false;
      }
      const run = runs.get(saved.id);
      if (run !== undefined) {
        run.session.setSessionName(trimmed);
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
      rmSync(join(outputFolder, saved.id), { recursive: true, force: true });
      savedRequests.remove(saved.id);
      await profiles.removeChoices(saved.id);
      emitProjects();
      return true;
    },
    async exportMarkdown(id) {
      const saved = await findSaved(id);
      if (saved === undefined) {
        return undefined;
      }
      const { messages } = SessionManager.open(saved.path, sessionDirectory).buildSessionContext();
      return markdownOf(summaryOf(saved).title, messages);
    },
    async getArchived() {
      return (await savedChats.listArchived()).map((saved) => ({
        ...summaryOf(saved),
        folder: folderOf(saved),
        projectName: basename(folderOf(saved)),
      }));
    },
    async stopAll() {
      profiles.close();
      const running = [...runs.values()];
      for (const run of running) {
        stoppingChats.add(run.session.sessionId);
      }
      try {
        await Promise.all([
          background.stopAll(),
          ...[...commandStops.values()].map((stop) => stop()),
          ...running.map((run) => run.session.abort()),
        ]);
      } finally {
        for (const run of running) {
          stoppingChats.delete(run.session.sessionId);
        }
      }
    },
    async startNew(id, newFolder, profile) {
      const source = await acquire(id);
      if (source === undefined) {
        return undefined;
      }
      try {
        const target = newFolder === undefined ? source.folder : toFolder(newFolder);
        if (!(await getProjects()).some((project) => project.folder === target)) {
          return undefined;
        }
        const run = await openNew(target, profile, source);
        const createdId = run.session.sessionId;
        releaseIfIdle(run);
        return createdId;
      } finally {
        close(source);
      }
    },
  };
}

// Windows paths can carry the drive letter in either case, so one folder could look like two.
function toFolder(path: string): string {
  return resolve(path).replace(/^[a-z]:/, (drive) => drive.toUpperCase());
}

// Writes a chat as Markdown, with a heading for each prompt and for each reply, which names the
// model that wrote it.
// A turn of the agent that only called tools has no text, so it gets no heading.
function markdownOf(title: string, messages: AgentMessage[]): string {
  const parts = [`# ${title}`];
  for (const message of messages) {
    const shown = toChatMessage(message);
    const text = (shown?.parts ?? [])
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("");
    if (
      shown !== undefined &&
      shown.role !== "note" &&
      (text.trim() !== "" || shown.error !== null)
    ) {
      const heading = message.role === "assistant" ? `Agent (${message.model})` : "You";
      const body = shown.error === null ? text : `${text}\n\n*${shown.error}*`;
      parts.push(`## ${heading}`, body.trim());
    }
  }
  return `${parts.filter((part) => part !== "").join("\n\n")}\n`;
}

// Pi keeps each result of a tool as a message of its own, and the chat shows it with its call.
function chatMessagesOf(
  messages: AgentMessage[],
  savedTimes: Map<number, (number | null)[]>,
): ChatMessage[] {
  const calls = new Map<string, ToolCallPart>();
  const shown: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "toolResult") {
      const call = calls.get(message.toolCallId);
      if (call !== undefined) {
        call.result = toolResultOf(message);
      }
    } else {
      const chatMessage = toChatMessage(message, savedTimes.get(message.timestamp));
      for (const part of chatMessage?.parts ?? []) {
        if (part.type === "toolCall") {
          calls.set(part.id, part);
        }
      }
      if (chatMessage !== undefined) {
        shown.push(chatMessage);
      }
    }
  }
  return shown;
}

// The fingerprints of a file stay in the chat file for the tools, and never go to the UI.
function withoutFingerprint(details: unknown): unknown {
  if (typeof details !== "object" || details === null || !("fingerprint" in details)) {
    return details;
  }
  const { fingerprint: _fingerprint, ...rest } = details as Record<string, unknown>;
  return rest;
}

function toolResultOf(message: ToolResultMessage): ToolResult {
  return {
    text: message.content.map((block) => (block.type === "text" ? block.text : "")).join(""),
    images: message.content.flatMap((block) =>
      block.type === "image" ? [{ mimeType: block.mimeType, data: block.data }] : [],
    ),
    isError: message.isError,
    details: withoutFingerprint(message.details ?? null),
  };
}

function toChatMessage(
  message: AgentMessage,
  thinkingTimes: (number | null)[] = [],
): ChatMessage | undefined {
  if (message.role === "user") {
    return {
      role: "user",
      parts: partsOf(message.content, []),
      error: null,
      timestamp: message.timestamp,
      durationMs: null,
      commandEnd: null,
    };
  }
  if (message.role === "custom" && message.customType === commandEndType) {
    return {
      role: "note",
      parts: partsOf(message.content, []),
      error: null,
      timestamp: message.timestamp,
      durationMs: null,
      commandEnd: message.details as CommandEnd,
    };
  }
  if (message.role !== "assistant") {
    return undefined;
  }
  return {
    role: "assistant",
    parts: partsOf(message.content, thinkingTimes),
    error: errorOf(message),
    timestamp: message.timestamp,
    durationMs: message.durationMs ?? null,
    commandEnd: null,
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

// The parts skip what the chat does not show yet, and the times of the thinking follow the places
// of the blocks in the message.
function partsOf(content: MessageContent, thinkingTimes: (number | null)[]): MessagePart[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content.flatMap((block, index): MessagePart[] => {
    if (block.type === "text") {
      return [{ type: "text", text: block.text }];
    }
    if (block.type === "thinking") {
      return [thinkingPartOf(block, thinkingTimes[index] ?? null)];
    }
    if (block.type === "toolCall") {
      return [toolCallPartOf(block)];
    }
    return [];
  });
}

function toolCallPartOf(
  block: Extract<MessageContent[number], { type: "toolCall" }>,
): ToolCallPart {
  return { type: "toolCall", id: block.id, name: block.name, input: block.arguments, result: null };
}

function thinkingPartOf(
  block: Extract<MessageContent[number], { type: "thinking" }>,
  durationMs: number | null,
): MessagePart {
  return {
    type: "thinking",
    text: block.thinking,
    isRedacted: block.redacted === true,
    durationMs,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The message could not be sent.";
}

function chatOverridesOf(manager: SessionManager): ChatOverrides {
  const context = manager.buildSessionContext();
  return {
    ...(context.model === null
      ? {}
      : { model: { providerId: context.model.provider, modelId: context.model.modelId } }),
    thinkingLevel: context.thinkingLevel as NonNullable<ChatOverrides["thinkingLevel"]>,
  };
}
