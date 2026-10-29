import type {
  ChatEvent,
  ChatMessage,
  ChatState,
  ChatSummary,
  CommandEnd,
  MessagePart,
  ModelSummary,
  ProjectSummary,
  ToolCallPart,
  ToolResult,
} from "independum/api-types";
import { type ReactElement, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  archiveChat,
  type ChatConnection,
  chooseModel,
  chooseThinking,
  fetchChatMarkdown,
  fetchContext,
  fetchModels,
  followChat,
  moveCommandToBackground,
  openChat,
  pinChat,
  renameChat,
  sendMessage,
  startNewChat,
  stopCommand,
  stopReply,
} from "./chat-api.ts";
import { ChatMessages } from "./chat-messages.tsx";
import type { ChatActions } from "./chat-row.tsx";
import { chatWidth, readColumnWidth } from "./column-width.ts";
import { DeleteChatDialog } from "./delete-chat-dialog.tsx";
import { isCallRunning, type ToolRun } from "./describe-tool-call.ts";
import { downloadText } from "./download-text.ts";
import { IconButton } from "./icon-button.tsx";
import { MessageBox } from "./message-box.tsx";
import { SettingsDialog, type SettingsSection } from "./settings-dialog.tsx";
import { shortcuts, useShortcut } from "./shortcut.ts";
import { type PlaceRequest, SidePanel } from "./side-panel.tsx";
import { Sidebar } from "./sidebar.tsx";
import { SlidingTitle } from "./sliding-title.tsx";
import type { ToolCalls } from "./tool-step.tsx";
import { useChatData } from "./use-chat-data.ts";
import styles from "./working-screen.module.css";

/** Properties of the working screen. */
interface WorkingScreenProps {
  startsWithLogins: boolean;
  onExpiredLink: () => void;
}

// How long New chat stays orange before it fades back.
const flashTime = 140;
// The tools whose result says how a background command ended.
const endTools = new Set(["StopCommand", "CheckCommand"]);

/** Draws the sidebar with the projects and their chats, and the open chat with its message box. */
export function WorkingScreen({
  startsWithLogins,
  onExpiredLink,
}: WorkingScreenProps): ReactElement {
  const [chat, setChat] = useState<ChatState | undefined>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [reply, setReply] = useState<MessagePart[]>([]);
  const [toolRuns, setToolRuns] = useState<Record<string, ToolRun>>({});
  const [connection, setConnection] = useState<ChatConnection>("following");
  const [models, setModels] = useState<ModelSummary[] | undefined>();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => !isPhone());
  const [isNewChatFlashing, setIsNewChatFlashing] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>(
    startsWithLogins ? "logins" : undefined,
  );
  const [notice, setNotice] = useState<string | undefined>();
  const [chatToDelete, setChatToDelete] = useState<ChatSummary | undefined>();
  const [placeRequest, setPlaceRequest] = useState<PlaceRequest | undefined>();
  const [shownStep, setShownStep] = useState<ToolCalls["shown"]>();
  // The context meter and the Context place show the same summary, so it loads once here.
  const context = useChatData(fetchContext, chat);

  const loadModels = useCallback((): void => {
    fetchModels().then(setModels, () => setModels([]));
  }, []);

  useEffect(() => {
    loadModels();
    return followChat(
      (event) => {
        if (event.type === "projects") {
          setProjects(event.projects);
        }
        applyEvent(event, setChat);
        if (event.type === "state" || (event.type === "message" && event.message.role !== "user")) {
          setReply([]);
        } else if (event.type === "replyDelta" || event.type === "replyPart") {
          setReply((current) => updateReply(current, event));
        }
        if (event.type === "state") {
          setToolRuns(runsOf(event.state));
        } else if (event.type === "commandEnd") {
          setToolRuns((current) => withEnd(current, event.end));
        } else if (event.type === "toolStart" || event.type === "toolProgress") {
          setToolRuns((current) => ({
            ...current,
            [event.id]: {
              startedAt: current[event.id]?.startedAt ?? Date.now(),
              details: event.type === "toolProgress" ? event.details : null,
            },
          }));
        }
      },
      (next) => (next === "expiredLink" ? onExpiredLink() : setConnection(next)),
    );
  }, [loadModels, onExpiredLink]);

  useEffect(() => {
    if (!isNewChatFlashing) {
      return;
    }
    const timer = setTimeout(() => setIsNewChatFlashing(false), flashTime);
    return () => clearTimeout(timer);
  }, [isNewChatFlashing]);

  // The sidebar, the chat, and the side panel fit side by side only on a window wide enough for
  // all three, so on a narrower one opening the sidebar or the side panel closes the other. A phone
  // shows each over the chat instead. See decision 0025.
  function showSidebar(isOpen: boolean): void {
    setIsSidebarOpen(isOpen);
    if (isOpen && isCrowded()) {
      setIsPanelOpen(false);
    }
  }

  function showPanel(isOpen: boolean): void {
    setIsPanelOpen(isOpen);
    if (isOpen && isCrowded()) {
      setIsSidebarOpen(false);
    }
  }

  const onWidthChange = useEffectEvent((): void => {
    if (isCrowded() && isSidebarOpen && isPanelOpen) {
      setIsSidebarOpen(false);
    }
  });

  useEffect(() => {
    function handleResize(): void {
      onWidthChange();
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // On a phone, the sidebar covers the chat, so it closes once the user has chosen.
  function closeSidebarOnPhone(): void {
    if (isPhone()) {
      setIsSidebarOpen(false);
    }
  }

  function startNew(folder?: string): void {
    setIsNewChatFlashing(true);
    setNotice(undefined);
    closeSidebarOnPhone();
    startNewChat(folder).catch(() => setNotice("The new chat could not start. Try again."));
  }

  function open(id: string): void {
    setNotice(undefined);
    closeSidebarOnPhone();
    openChat(id).catch(() => setNotice("That chat could not be opened. Try again."));
  }

  function choose(model: ModelSummary): void {
    setNotice(undefined);
    chooseModel(model.providerId, model.id).catch(() =>
      setNotice("That model is not available. Choose another one."),
    );
  }

  function openContext(): void {
    setPlaceRequest({ place: "context", at: Date.now() });
    showPanel(true);
  }

  function openCommands(): void {
    setPlaceRequest({ place: "commands", at: Date.now() });
    showPanel(true);
  }

  // A step opens in the chat, so on a phone the side panel gets out of its way.
  function showStep(id: string): void {
    setShownStep({ id, at: Date.now() });
    if (isPhone()) {
      setIsPanelOpen(false);
    }
  }

  // A command that ends on its own just before the user stops it needs no notice.
  const ends = chat === undefined ? {} : endsOf(chat.messages, toolRuns);
  const tools: ToolCalls = {
    runs: toolRuns,
    ends,
    shown: shownStep,
    onMove: (id) => {
      moveCommandToBackground(id).catch(() => undefined);
    },
    onStop: (id) => {
      stopCommand(id).catch(() => undefined);
    },
  };
  const commands = chat === undefined ? [] : commandsOf(chat.messages, reply);
  const runningCount = commands.filter((part) =>
    isCallRunning(part, toolRuns[part.id], ends[part.id], chat?.isReplying === true),
  ).length;

  function openLogins(): void {
    setSettingsSection("logins");
  }

  // Each change runs on the server, which then sends the projects again, so a failure only needs a
  // notice.
  function change(work: Promise<void>, failure: string): void {
    setNotice(undefined);
    work.catch(() => setNotice(failure));
  }

  const chatActions: ChatActions = {
    onOpen: open,
    onRename: (id, name) =>
      change(renameChat(id, name), "The chat could not be renamed. Try again."),
    onPin: (id, isPinned) =>
      change(pinChat(id, isPinned), "The chat could not be pinned. Try again."),
    onExport: (saved) =>
      change(
        fetchChatMarkdown(saved.id).then((markdown) =>
          downloadText(fileNameOf(saved.title), markdown, "text/markdown"),
        ),
        "The chat could not be exported. Try again.",
      ),
    onArchive: (id) => change(archiveChat(id, true), "The chat could not be archived. Try again."),
    onDelete: setChatToDelete,
  };

  async function send(text: string): Promise<void> {
    setNotice(undefined);
    try {
      await sendMessage(text);
    } catch (error) {
      setNotice("The message was not sent. Try again.");
      throw error;
    }
  }

  useShortcut(shortcuts.newChat, () => startNew());
  useShortcut(shortcuts.sidebar, () => showSidebar(!isSidebarOpen));
  useShortcut(shortcuts.sidePanel, () => showPanel(!isPanelOpen));
  useShortcut(shortcuts.settings, openLogins);

  const isEmpty = chat !== undefined && chat.messages.length === 0 && !chat.isReplying;
  const saved = projects
    .flatMap((project) => project.chats)
    .find((candidate) => candidate.id === chat?.id);
  const title = saved?.title ?? "New chat";
  // The title of a new chat types itself in once its first message lists it in the sidebar.
  const lastListing = useRef({ id: chat?.id, isListed: true });
  const isNewlyListed =
    saved !== undefined && lastListing.current.id === chat?.id && !lastListing.current.isListed;

  useEffect(() => {
    lastListing.current = { id: chat?.id, isListed: saved !== undefined };
  }, [chat?.id, saved]);

  return (
    <div className={styles.screen}>
      <Sidebar
        projects={projects}
        chatId={chat?.id ?? null}
        folder={chat?.folder ?? ""}
        isOpen={isSidebarOpen}
        isNewChatFlashing={isNewChatFlashing}
        onHide={() => setIsSidebarOpen(false)}
        onNewChat={startNew}
        chatActions={chatActions}
        onOpenSettings={openLogins}
      />
      {isSidebarOpen ? (
        <button
          type="button"
          className={styles.scrim}
          aria-label="Hide sidebar"
          tabIndex={-1}
          onClick={() => setIsSidebarOpen(false)}
        />
      ) : null}
      <main className={styles.main} data-empty={isEmpty}>
        <header className={styles.header}>
          {isSidebarOpen ? null : (
            <>
              <IconButton
                icon="sidebar"
                label="Show sidebar"
                shortcut={shortcuts.sidebar}
                tipAlign="start"
                onClick={() => showSidebar(true)}
              />
              <IconButton
                icon="newChat"
                label="New chat"
                shortcut={shortcuts.newChat}
                onClick={() => startNew()}
              />
            </>
          )}
          <p className={styles.title}>
            {chat === undefined ? null : (
              <SlidingTitle key={title} text={title} isTyped={isNewlyListed} />
            )}
          </p>
          {isPanelOpen ? null : (
            <IconButton
              icon="sidePanel"
              label="Show side panel"
              shortcut={shortcuts.sidePanel}
              tipAlign="end"
              onClick={() => showPanel(true)}
            />
          )}
        </header>
        {chat === undefined ? null : (
          <>
            <div className={styles.above} />
            <div className={styles.greeting} aria-hidden={!isEmpty}>
              <h1 className={styles.question}>What should we work on?</h1>
            </div>
            <div className={styles.messages}>
              <ChatMessages
                chatId={chat.id}
                messages={chat.messages}
                reply={reply}
                tools={tools}
                isReplying={chat.isReplying}
              />
            </div>
            {notice === undefined ? null : <p className={styles.notice}>{notice}</p>}
            {connection === "reconnecting" ? (
              <p className={styles.status}>Reconnecting to Independum.</p>
            ) : null}
            <MessageBox
              chatId={chat.id}
              model={chat.model}
              thinking={chat.thinking}
              context={context}
              models={models}
              folder={chat.folder}
              projects={projects}
              isEmpty={isEmpty}
              isReplying={chat.isReplying}
              onSend={send}
              onStop={stopReply}
              onOpenModels={loadModels}
              onChooseModel={choose}
              onChooseThinking={(level) => {
                chooseThinking(level).catch(() =>
                  setNotice("That thinking level is not available. Choose another one."),
                );
              }}
              onChooseFolder={startNew}
              onManageLogins={openLogins}
              onOpenContext={openContext}
              runningCount={runningCount}
              onOpenCommands={openCommands}
            />
            <div className={styles.below} />
          </>
        )}
      </main>
      {chat === undefined ? null : (
        <SidePanel
          isOpen={isPanelOpen}
          chat={chat}
          context={context}
          commands={commands}
          tools={tools}
          models={models}
          placeRequest={placeRequest}
          onShowStep={showStep}
          onHide={() => setIsPanelOpen(false)}
        />
      )}
      <SettingsDialog
        section={settingsSection}
        onSection={setSettingsSection}
        onClose={() => setSettingsSection(undefined)}
        onLoginsChanged={loadModels}
      />
      {chatToDelete === undefined ? null : (
        <DeleteChatDialog
          chat={chatToDelete}
          isArchived={false}
          onClose={() => setChatToDelete(undefined)}
          onDone={setNotice}
        />
      )}
    </div>
  );
}

// A file name keeps the letters, digits, spaces, and dashes of a title, so it works on every system,
// and a long title ends at its last whole word.
function fileNameOf(title: string): string {
  const words = title.replace(/[^A-Za-z0-9 -]/g, "").trim();
  const name = words.length <= 60 ? words : words.slice(0, 61).replace(/\s+\S*$/, "");
  return `${name === "" ? "chat" : name}.md`;
}

function isPhone(): boolean {
  return window.matchMedia("(max-width: 760px)").matches;
}

// A window is crowded when it cannot hold both columns at their widths and a readable chat.
function isCrowded(): boolean {
  const needed = readColumnWidth("start") + chatWidth + readColumnWidth("end");
  return !isPhone() && window.innerWidth < needed;
}

// Each part of the reply in progress keeps its place in the message, so a delta or a finished part
// lands where Pi puts it.
function updateReply(
  reply: MessagePart[],
  event: Extract<ChatEvent, { type: "replyDelta" | "replyPart" }>,
): MessagePart[] {
  const next = [...reply];
  while (next.length <= event.index) {
    next.push({ type: "text", text: "" });
  }
  const current = next[event.index];
  if (event.type === "replyPart") {
    next[event.index] = event.part;
  } else if (current?.type === event.partType) {
    next[event.index] = { ...current, text: current.text + event.delta };
  } else {
    next[event.index] =
      event.partType === "text"
        ? { type: "text", text: event.delta }
        : { type: "thinking", text: event.delta, isRedacted: false, durationMs: null };
  }
  return next;
}

// The commands of the chat are its calls to the Shell tool, with the one the model is writing.
function commandsOf(messages: ChatMessage[], reply: MessagePart[]): ToolCallPart[] {
  return [...messages.flatMap((message) => message.parts), ...reply].filter(
    (part): part is ToolCallPart => part.type === "toolCall" && part.name === "Shell",
  );
}

// The background commands that still run come with the chat, so their steps keep their timers
// after a reload.
function runsOf(state: ChatState): Record<string, ToolRun> {
  return Object.fromEntries(
    state.backgroundCommands.map((command) => [
      command.toolCallId,
      { startedAt: command.startedAt, details: command.progress },
    ]),
  );
}

function withEnd(runs: Record<string, ToolRun>, end: CommandEnd): Record<string, ToolRun> {
  const run = runs[end.toolCallId];
  return {
    ...runs,
    [end.toolCallId]: {
      startedAt: run?.startedAt ?? Date.now(),
      details: run?.details ?? null,
      end,
    },
  };
}

// A background command ended while the chat was open, or before, as a note in the chat or the
// result of StopCommand or CheckCommand says.
function endsOf(
  messages: ChatMessage[],
  runs: Record<string, ToolRun>,
): Record<string, CommandEnd> {
  const ends: Record<string, CommandEnd> = {};
  for (const message of messages) {
    if (message.commandEnd !== null) {
      ends[message.commandEnd.toolCallId] = message.commandEnd;
    }
    for (const part of message.parts) {
      const details =
        part.type === "toolCall" && endTools.has(part.name) ? part.result?.details : undefined;
      if (typeof details === "object" && details !== null && "toolCallId" in details) {
        const end = details as CommandEnd;
        ends[end.toolCallId] = end;
      }
    }
  }
  for (const [id, run] of Object.entries(runs)) {
    if (run.end !== undefined) {
      ends[id] = run.end;
    }
  }
  return ends;
}

function withResult(message: ChatMessage, id: string, result: ToolResult): ChatMessage {
  return message.parts.some((part) => part.type === "toolCall" && part.id === id)
    ? {
        ...message,
        parts: message.parts.map((part) =>
          part.type === "toolCall" && part.id === id ? { ...part, result } : part,
        ),
      }
    : message;
}

function applyEvent(
  event: ChatEvent,
  setChat: (update: (current: ChatState | undefined) => ChatState | undefined) => void,
): void {
  if (event.type === "state") {
    setChat(() => event.state);
  } else if (event.type === "message") {
    setChat((current) => current && { ...current, messages: [...current.messages, event.message] });
  } else if (event.type === "replying") {
    setChat((current) => current && { ...current, isReplying: event.isReplying });
  } else if (event.type === "toolResult") {
    setChat(
      (current) =>
        current && {
          ...current,
          messages: current.messages.map((message) => withResult(message, event.id, event.result)),
        },
    );
  }
}
