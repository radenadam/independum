import { rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionAPI,
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
  CommandEnd,
  ContextSummary,
  MessagePart,
  ProjectSummary,
  SettingsChange,
  ShellChoice,
  ShellKind,
  ToolCallPart,
  ToolResult,
  ToolSummary,
} from "./api-types.ts";
import { createSavedChats } from "./create-saved-chats.ts";
import { builtInSettings, createSettings } from "./create-settings.ts";
import {
  changeTexts,
  createModelTexts,
  defineText,
  type ModelText,
  summarizeTexts,
} from "./model-texts.ts";
import { summarizePiTexts } from "./pi-texts.ts";
import {
  type BackgroundEnded,
  backgroundTextList,
  createBackgroundCommands,
  describeBackgroundNote,
} from "./tools/create-background-commands.ts";
import { checkCommandTextList, createCheckCommandTool } from "./tools/create-check-command-tool.ts";
import { createEditTool, editTextList } from "./tools/create-edit-tool.ts";
import { outputTextList } from "./tools/create-output-log.ts";
import { createReadTool, readTextList } from "./tools/create-read-tool.ts";
import { createShellTool, shellTextList } from "./tools/create-shell-tool.ts";
import { createStopCommandTool, stopCommandTextList } from "./tools/create-stop-command-tool.ts";
import { createWriteTool, writeTextList } from "./tools/create-write-tool.ts";
import { environmentSuggestions } from "./tools/environment-suggestions.ts";
import { fingerprintTextList } from "./tools/file-fingerprint.ts";
import { defaultShellKind, findShell, missingShellOf } from "./tools/find-shell.ts";
import { fileTextList } from "./tools/text-file.ts";
import { envelopeText } from "./wrap-note.ts";

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

// Pi keeps no time for thinking, so Independum saves it in a custom entry, which Pi keeps in the
// chat file and never sends to the model.
const thinkingTimesType = "independum-thinking-times";
// The note that wakes the agent when one of its background commands ends.
const commandEndType = "independum-command-end";

// The prompt says only where the agent is and where it works, and leaves how to work to the model
// and the descriptions of its tools.
const systemPromptText = defineText({
  id: "systemPrompt",
  group: "System prompt",
  section: "prompt",
  label: "Every request",
  builtIn:
    "You are the agent in Independum, an agent harness, and you work on the computer of the user, in the project folder below.",
  slots: {},
});
// Every model text. The Agent place groups them, and keeps this order within each group.
const allTexts: ModelText[] = [
  systemPromptText,
  ...readTextList,
  ...fingerprintTextList,
  ...fileTextList,
  ...writeTextList,
  ...editTextList,
  ...shellTextList,
  ...backgroundTextList,
  ...checkCommandTextList,
  ...stopCommandTextList,
  ...outputTextList,
  envelopeText,
];
const shellKinds: ShellKind[] = ["powershell", "bash"];
// A tool call that the model is still writing reaches the chat at most this often.
const callUpdateInterval = 80;

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
  changeSettings(change: SettingsChange): Promise<AgentSummary | undefined>;
  getContext(): ContextSummary;
  getProjects(): Promise<ProjectSummary[]>;
  subscribe(listener: (event: ChatEvent) => void): () => void;
  send(text: string): boolean;
  chooseModel(providerId: string, modelId: string): Promise<boolean>;
  chooseThinking(level: string): boolean;
  open(id: string): Promise<boolean>;
  stop(): Promise<void>;
  stopCommand(id: string): boolean;
  moveToBackground(id: string): boolean;
  stopAll(): void;
  startNew(folder?: string): Promise<boolean>;
  rename(id: string, name: string): Promise<boolean>;
  pin(id: string, isPinned: boolean): Promise<boolean>;
  archive(id: string, isArchived: boolean): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  getArchived(): Promise<ArchivedChatSummary[]>;
  exportMarkdown(id: string): Promise<string | undefined>;
}

/** Reopens the latest chat of the folder Independum starts from, or starts an empty one there. */
export async function createChat({ models, directory, cwd }: ChatOptions): Promise<Chat> {
  const sessionDirectory = join(directory, "sessions");
  const savedChats = await createSavedChats(sessionDirectory, join(directory, "pinned-chats.json"));
  const startFolder = toFolder(cwd);
  const settings = await createSettings(join(directory, "settings.json"));
  const texts = createModelTexts(() => settings.get().texts);
  let shell = findShell(settings.get().shell ?? undefined);
  const outputFolder = join(directory, "outputs");
  const commandStops = new Map<string, () => void>();
  const commandHandBacks = new Map<string, () => void>();
  const background = createBackgroundCommands({
    onProgress(chatId, toolCallId, progress) {
      if (session?.sessionId === chatId) {
        emit({ type: "toolProgress", id: toolCallId, details: progress });
      }
    },
    onEnd: noteEnd,
  });
  // Independum's own tools, which every chat shares. Pi registers its built-in tools too, and they
  // stay off.
  const ownTools = [
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
  const listeners = new Set<(event: ChatEvent) => void>();
  let session: AgentSession | undefined;
  // The hidden extension of the open chat, through which Independum registers its tools anew.
  let extension: ExtensionAPI | undefined;
  let folder = startFolder;
  let stopFollowing: (() => void) | undefined;
  let isModelChosen = false;
  let isReplying = false;
  let lastRequest: unknown = null;
  let cacheWarmings = 0;
  // The thinking of the reply in progress, by the place of each part in the message.
  const thinkingStarts = new Map<number, number>();
  const thinkingTimes = new Map<number, number>();
  let lastCallUpdate = 0;

  function emit(event: ChatEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function getState(): ChatState {
    const model = isModelChosen ? session?.model : undefined;
    const savedTimes = readThinkingTimes();
    return {
      id: session?.sessionId ?? null,
      folder,
      model: model === undefined ? null : { providerId: model.provider, id: model.id },
      // Pi offers only the levels that the model supports, and none for a model that cannot think.
      thinking:
        model === undefined || session?.supportsThinking() !== true
          ? null
          : { level: session.thinkingLevel, levels: session.getAvailableThinkingLevels() },
      messages: chatMessagesOf(session?.messages ?? [], savedTimes),
      isReplying,
      backgroundCommands: session === undefined ? [] : background.listRunning(session.sessionId),
    };
  }

  // A background command that ends wakes the agent of its chat with a note of how it ended. A chat
  // that is not open keeps the note for its next turn. A command that the model stopped, or waited
  // on with CheckCommand, needs no note, because the result of that tool says how it ended.
  function noteEnd(ended: BackgroundEnded): void {
    const isOpen = session?.sessionId === ended.chatId;
    if (isOpen) {
      emit({ type: "commandEnd", end: ended.end });
    }
    if (ended.isSeenByModel) {
      return;
    }
    const note = {
      customType: commandEndType,
      content: describeBackgroundNote(ended, texts),
      display: true,
      details: ended.end,
    };
    if (isOpen) {
      session
        ?.sendCustomMessage(note, { triggerTurn: true, deliverAs: "steer" })
        .catch(() => undefined);
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

  function readThinkingTimes(): Map<number, (number | null)[]> {
    const times = new Map<number, (number | null)[]>();
    for (const entry of session?.sessionManager.getEntries() ?? []) {
      if (entry.type === "custom" && entry.customType === thinkingTimesType) {
        const saved = entry.data as ThinkingTimes;
        times.set(saved.timestamp, saved.durationsMs);
      }
    }
    return times;
  }

  // Pi streams each part of a reply by its place in the message, so the UI builds the reply in
  // progress the same way.
  function showUpdate(update: ReplyUpdate): void {
    if (update.type === "text_delta" || update.type === "thinking_delta") {
      emit({
        type: "replyDelta",
        index: update.contentIndex,
        partType: update.type === "text_delta" ? "text" : "thinking",
        delta: update.delta,
      });
    } else if (update.type === "thinking_start" || update.type === "thinking_end") {
      if (update.type === "thinking_start") {
        thinkingStarts.set(update.contentIndex, performance.now());
      } else {
        const start = thinkingStarts.get(update.contentIndex) ?? performance.now();
        thinkingTimes.set(update.contentIndex, Math.round(performance.now() - start));
      }
      const block = update.partial.content[update.contentIndex];
      if (block?.type === "thinking") {
        emit({
          type: "replyPart",
          index: update.contentIndex,
          part: thinkingPartOf(block, thinkingTimes.get(update.contentIndex) ?? null),
        });
      }
    } else if (
      update.type === "toolcall_start" ||
      update.type === "toolcall_delta" ||
      update.type === "toolcall_end"
    ) {
      showCall(update);
    }
  }

  // Pi reads the arguments of a call as they stream, so the chat shows the call as it is written.
  function showCall(
    update: Extract<ReplyUpdate, { type: "toolcall_start" | "toolcall_delta" | "toolcall_end" }>,
  ): void {
    const now = performance.now();
    if (update.type === "toolcall_delta" && now - lastCallUpdate < callUpdateInterval) {
      return;
    }
    lastCallUpdate = now;
    const block =
      update.type === "toolcall_end"
        ? update.toolCall
        : update.partial.content[update.contentIndex];
    if (block?.type === "toolCall") {
      emit({ type: "replyPart", index: update.contentIndex, part: toolCallPartOf(block) });
    }
  }

  function timesOf(message: AgentMessage): (number | null)[] {
    return message.role === "assistant"
      ? message.content.map((_, index) => thinkingTimes.get(index) ?? null)
      : [];
  }

  // A turn ends once Pi has saved its reply and the results of its tools, so the times follow them
  // and never land between a tool call and its result.
  function saveThinkingTimes(message: AgentMessage): void {
    if (session !== undefined && message.role === "assistant" && thinkingTimes.size > 0) {
      const saved: ThinkingTimes = { timestamp: message.timestamp, durationsMs: timesOf(message) };
      session.sessionManager.appendCustomEntry(thinkingTimesType, saved);
    }
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
    } else if (event.type === "message_start" && event.message.role === "assistant") {
      thinkingStarts.clear();
      thinkingTimes.clear();
    } else if (event.type === "message_update") {
      showUpdate(event.assistantMessageEvent);
    } else if (event.type === "turn_end") {
      saveThinkingTimes(event.message);
    } else if (event.type === "tool_execution_start") {
      emit({ type: "toolStart", id: event.toolCallId });
    } else if (event.type === "tool_execution_update") {
      emit({
        type: "toolProgress",
        id: event.toolCallId,
        details: event.partialResult?.details ?? null,
      });
    } else if (event.type === "message_end" && event.message.role === "toolResult") {
      emit({
        type: "toolResult",
        id: event.message.toolCallId,
        result: toolResultOf(event.message),
      });
    } else if (event.type === "message_end") {
      const message = toChatMessage(event.message, timesOf(event.message));
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
    // Without its own settings and an empty addendum, Pi reads its settings from the project and
    // from `~/.independum`, and adds any `APPEND_SYSTEM.md` there to the system prompt, so a file
    // in a project could reach the model unseen.
    const piSettings = SettingsManager.inMemory();
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
            extension = pi;
            let isWarming = false;
            for (const tool of ownTools) {
              pi.registerTool(tool);
            }
            pi.on("before_agent_start", (event) => {
              event.systemPromptOptions.customPrompt = texts.get(systemPromptText);
            });
            pi.on("cache_warming_decision", (event) => {
              isWarming = event.action === "warm";
            });
            pi.on("before_provider_request", (event) => {
              if (isWarming) {
                isWarming = false;
                cacheWarmings += 1;
              } else {
                lastRequest = event.payload;
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
    });
    session = created.session;
    session.setActiveToolsByName(activeToolNames());
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
    cacheWarmings = 0;
    emit({ type: "state", state: getState() });
    emitProjects();
  }

  // Pi builds the system prompt from Independum's prompt and then adds its own sections, such as
  // the folder, so everything after Independum's prompt is what Pi adds. Until the next turn, Pi
  // may still start from the prompt that the chat opened with.
  function getAgent(): AgentSummary {
    const prompt = texts.get(systemPromptText);
    const fullPrompt = session?.systemPrompt ?? prompt;
    const start = [prompt, systemPromptText.builtIn].find((each) => fullPrompt.startsWith(each));
    return {
      systemPrompt: prompt,
      addedByPi: start === undefined ? fullPrompt : fullPrompt.slice(start.length).trim(),
      tools: ownToolInfos().map(
        (tool): ToolSummary => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          isEnabled: !settings.get().disabledTools.includes(tool.name),
          unavailable: unavailableOf(tool.name),
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
      chosenShell: settings.get().shell,
      outputLimits: settings.get().outputLimits,
      builtInOutputLimits: builtInSettings.outputLimits,
      handBackSeconds: settings.get().handBackSeconds,
      builtInHandBackSeconds: builtInSettings.handBackSeconds,
      texts: summarizeTexts(allTexts, settings.get().texts),
      piTexts: summarizePiTexts(lastRequest),
      environment: settings.get().environment,
      environmentSuggestions,
    };
  }

  function ownToolInfos(): ReturnType<AgentSession["getAllTools"]> {
    return (session?.getAllTools() ?? []).filter((tool) =>
      ownTools.some((own) => own.name === tool.name),
    );
  }

  // A tool runs only when the user has not turned it off and it can run on this computer.
  function activeToolNames(): string[] {
    return ownToolInfos()
      .map((tool) => tool.name)
      .filter(
        (name) => !settings.get().disabledTools.includes(name) && unavailableOf(name) === null,
      );
  }

  function unavailableOf(toolName: string): string | null {
    if (toolName !== "Shell" || shell !== undefined) {
      return null;
    }
    return missingShellOf(settings.get().shell ?? defaultShellKind());
  }

  // A change names model texts by their ids, so one that names a text that does not exist is
  // refused whole. Pi reads the tools again when Independum registers them anew, so a new shell or
  // an edited text reaches the model with the next turn.
  async function changeSettings(change: SettingsChange): Promise<AgentSummary | undefined> {
    const { texts: textChange, ...rest } = change;
    const edited =
      textChange === undefined
        ? settings.get().texts
        : changeTexts(allTexts, settings.get().texts, textChange);
    if (edited === undefined) {
      return undefined;
    }
    await settings.change({ ...rest, texts: edited });
    shell = findShell(settings.get().shell ?? undefined);
    for (const tool of ownTools) {
      extension?.registerTool(tool);
    }
    session?.setActiveToolsByName(activeToolNames());
    return getAgent();
  }

  // Pi counts the tokens and the cost of every saved reply, and estimates how full the context
  // window is from the latest one. It leaves reasoning tokens out of its sums, so they are added here
  // over the same entries.
  function getContext(): ContextSummary {
    const stats = session?.getSessionStats();
    const usage = session?.getContextUsage();
    const model = isModelChosen ? session?.model : undefined;
    let reasoning = 0;
    for (const entry of session?.sessionManager.getEntries() ?? []) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        reasoning += entry.message.usage.reasoning ?? 0;
      }
    }
    const branch = session?.sessionManager.getBranch() ?? [];
    return {
      chatId: session?.sessionId ?? null,
      provider: model?.provider ?? null,
      model: model?.id ?? null,
      contextWindow: usage?.contextWindow ?? null,
      contextTokens: usage?.tokens ?? null,
      tokens: {
        input: stats?.tokens.input ?? 0,
        output: stats?.tokens.output ?? 0,
        reasoning,
        cacheRead: stats?.tokens.cacheRead ?? 0,
        cacheWrite: stats?.tokens.cacheWrite ?? 0,
      },
      cost: stats?.cost ?? 0,
      userMessages: stats?.userMessages ?? 0,
      assistantMessages: stats?.assistantMessages ?? 0,
      toolCalls: stats?.toolCalls ?? 0,
      created: session?.sessionManager.getHeader()?.timestamp ?? null,
      lastActivity: branch.at(-1)?.timestamp ?? null,
      entries: branch.map((entry) => ({
        id: entry.id,
        type: entry.type,
        role: entry.type === "message" ? entry.message.role : null,
        timestamp: entry.timestamp,
        data: entry,
      })),
      lastRequest,
      cacheWarmings,
    };
  }

  const latest = (await listSaved()).find((saved) => folderOf(saved) === startFolder);
  await (latest === undefined ? openNew(startFolder) : openSaved(latest));

  return {
    getState,
    getAgent,
    changeSettings,
    getContext,
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
          message: {
            role: "assistant",
            parts: [],
            commandEnd: null,
            error: messageOf(error),
            timestamp: Date.now(),
            durationMs: null,
          },
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
      rmSync(join(outputFolder, saved.id), { recursive: true, force: true });
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
    stopCommand(id) {
      const stop = commandStops.get(id);
      stop?.();
      return stop !== undefined || background.stopByUser(id);
    },
    moveToBackground(id) {
      const handBack = commandHandBacks.get(id);
      handBack?.();
      return handBack !== undefined;
    },
    stopAll() {
      background.stopAll();
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
