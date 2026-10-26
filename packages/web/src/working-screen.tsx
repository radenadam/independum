import type { ChatEvent, ChatState, ModelSummary, ProjectSummary } from "independum/api-types";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import {
  type ChatConnection,
  chooseModel,
  fetchModels,
  followChat,
  openChat,
  sendMessage,
  startNewChat,
  stopReply,
} from "./chat-api.ts";
import { ChatMessages } from "./chat-messages.tsx";
import { IconButton } from "./icon-button.tsx";
import { MessageBox } from "./message-box.tsx";
import { shortcuts, useShortcut } from "./shortcut.ts";
import { Sidebar } from "./sidebar.tsx";
import styles from "./working-screen.module.css";

/** Properties of the working screen. */
interface WorkingScreenProps {
  onOpenSettings: () => void;
  onExpiredLink: () => void;
}

// How long New chat stays orange before it fades back.
const flashTime = 140;

/** Draws the sidebar with the projects and their chats, and the open chat with its message box. */
export function WorkingScreen({ onOpenSettings, onExpiredLink }: WorkingScreenProps): ReactElement {
  const [chat, setChat] = useState<ChatState | undefined>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [reply, setReply] = useState("");
  const [connection, setConnection] = useState<ChatConnection>("following");
  const [models, setModels] = useState<ModelSummary[] | undefined>();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => !isPhone());
  const [isNewChatFlashing, setIsNewChatFlashing] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

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
  useShortcut(shortcuts.sidebar, () => setIsSidebarOpen((isOpen) => !isOpen));
  useShortcut(shortcuts.settings, onOpenSettings);

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
        onOpenChat={open}
        onOpenSettings={onOpenSettings}
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
                onClick={() => setIsSidebarOpen(true)}
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
              models={models}
              folder={chat.folder}
              projects={projects}
              isEmpty={isEmpty}
              isReplying={chat.isReplying}
              onSend={send}
              onStop={stopReply}
              onOpenModels={loadModels}
              onChooseModel={choose}
              onChooseFolder={startNew}
              onManageLogins={onOpenSettings}
            />
            <div className={styles.below} />
          </>
        )}
      </main>
    </div>
  );
}

function isPhone(): boolean {
  return window.matchMedia("(max-width: 760px)").matches;
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
