import type {
  ChatEvent,
  ChatState,
  ChatSummary,
  ModelSummary,
  ProjectSummary,
} from "independum/api-types";
import { type ReactElement, useCallback, useEffect, useEffectEvent, useState } from "react";
import {
  archiveChat,
  type ChatConnection,
  chooseModel,
  chooseThinking,
  deleteChat,
  fetchModels,
  followChat,
  openChat,
  pinChat,
  renameChat,
  sendMessage,
  startNewChat,
  stopReply,
} from "./chat-api.ts";
import { ChatMessages } from "./chat-messages.tsx";
import type { ChatActions } from "./chat-row.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { IconButton } from "./icon-button.tsx";
import { MessageBox } from "./message-box.tsx";
import { SettingsDialog, type SettingsSection } from "./settings-dialog.tsx";
import { shortcuts, useShortcut } from "./shortcut.ts";
import { SidePanel } from "./side-panel.tsx";
import { Sidebar } from "./sidebar.tsx";
import styles from "./working-screen.module.css";

/** Properties of the working screen. */
interface WorkingScreenProps {
  startsWithLogins: boolean;
  onExpiredLink: () => void;
}

// How long New chat stays orange before it fades back.
const flashTime = 140;

/** Draws the sidebar with the projects and their chats, and the open chat with its message box. */
export function WorkingScreen({
  startsWithLogins,
  onExpiredLink,
}: WorkingScreenProps): ReactElement {
  const [chat, setChat] = useState<ChatState | undefined>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [reply, setReply] = useState("");
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
          setReply("");
        } else if (event.type === "replyDelta") {
          setReply((current) => current + event.delta);
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

  // The sidebar, the chat, and the side panel fit side by side only on a wide window, so on a
  // narrower one opening the sidebar or the side panel closes the other. A phone shows each over
  // the chat instead. See decision 0018.
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
    const query = window.matchMedia(roomyWidth);
    function handleChange(): void {
      onWidthChange();
    }
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
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
  const title =
    projects.flatMap((project) => project.chats).find((saved) => saved.id === chat?.id)?.title ??
    "New chat";

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
          <p className={styles.title}>{chat === undefined ? "" : title}</p>
          <IconButton
            icon="sidePanel"
            label="Side panel"
            shortcut={shortcuts.sidePanel}
            tipAlign="end"
            isPressed={isPanelOpen}
            onClick={() => showPanel(!isPanelOpen)}
          />
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
            />
            <div className={styles.below} />
          </>
        )}
      </main>
      {chat === undefined ? null : (
        <SidePanel
          isOpen={isPanelOpen}
          chat={chat}
          models={models}
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
        <ConfirmDialog
          title="Delete this chat?"
          text={`"${chatToDelete.title}" and its file in ~/.independum/sessions go away for good. Archive the chat instead to keep it out of sight.`}
          confirmLabel="Delete"
          onConfirm={() => {
            change(deleteChat(chatToDelete.id), "The chat could not be deleted. Try again.");
            setChatToDelete(undefined);
          }}
          onCancel={() => setChatToDelete(undefined)}
        />
      )}
    </div>
  );
}

// The sidebar, a readable chat, and the side panel need 272, 480, and 420 pixels.
const roomyWidth = "(min-width: 1180px)";

function isPhone(): boolean {
  return window.matchMedia("(max-width: 760px)").matches;
}

function isCrowded(): boolean {
  return !isPhone() && !window.matchMedia(roomyWidth).matches;
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
  }
}
