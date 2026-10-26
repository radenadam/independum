import type {
  ChatEvent,
  ChatMessage,
  ChatState,
  ModelSummary,
  ProjectSummary,
} from "independum/api-types";
import { type KeyboardEvent, type ReactElement, useCallback, useEffect, useState } from "react";
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
import { ChatList } from "./chat-list.tsx";
import styles from "./chat-screen.module.css";
import { CommandButton } from "./command-button.tsx";
import { HeadingRow } from "./heading-row.tsx";
import { ModelPicker } from "./model-picker.tsx";
import { PickList } from "./pick-list.tsx";
import { ScreenLayout } from "./screen-layout.tsx";
import { TextField } from "./text-field.tsx";

/** What the chat screen shows beside the margin. */
type View = "chat" | "models" | "chats";

/** Properties of the chat screen. */
interface ChatScreenProps {
  onManageLogins: () => void;
  onExpiredLink: () => void;
}

/** Draws the chat with its messages and models, and the saved chats in the margin. */
export function ChatScreen({ onManageLogins, onExpiredLink }: ChatScreenProps): ReactElement {
  const [chat, setChat] = useState<ChatState | undefined>();
  const [projects, setProjects] = useState<ProjectSummary[] | undefined>();
  const [reply, setReply] = useState("");
  const [connection, setConnection] = useState<ChatConnection>("following");
  const [models, setModels] = useState<ModelSummary[] | undefined>();
  const [view, setView] = useState<View>("chat");
  const [draft, setDraft] = useState("");
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

  // A chat without a model shows the models, unless the user asked for the chat list.
  const shown: View =
    view === "chats" || (view === "chat" && chat?.model !== null) ? view : "models";
  const messageCount = chat?.messages.length ?? 0;
  const chats = projects?.find((project) => project.folder === chat?.folder)?.chats;

  // Keeps the newest message in view, and puts the cursor in the message field when a keyboard is
  // likely.
  useEffect(() => {
    if (shown !== "chat") {
      return;
    }
    if (messageCount > 0 || reply !== "") {
      window.scrollTo({ top: document.body.scrollHeight });
    }
    if (hasKeyboard()) {
      document.getElementById("message")?.focus();
    }
  }, [shown, messageCount, reply]);

  function openPicker(): void {
    loadModels();
    setView("models");
  }

  function choose(model: ModelSummary): void {
    setNotice(undefined);
    chooseModel(model.providerId, model.id).then(
      () => setView("chat"),
      () => setNotice("That model is not available. Choose another one."),
    );
  }

  function open(id: string): void {
    setNotice(undefined);
    openChat(id).then(
      () => setView("chat"),
      () => setNotice("That chat could not be opened. Try again."),
    );
  }

  function startNew(): void {
    startNewChat();
    setView("chat");
  }

  function submit(): void {
    const text = draft.trim();
    if (text === "" || chat?.isReplying !== false) {
      return;
    }
    setDraft("");
    setNotice(undefined);
    sendMessage(text).catch(() => {
      setDraft(text);
      setNotice("The message was not sent. Try again.");
    });
  }

  function onFieldKey(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      hasKeyboard()
    ) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && chat?.isReplying === true) {
      event.preventDefault();
      stopReply();
    }
  }

  const current = models?.find(
    (model) => model.providerId === chat?.model?.providerId && model.id === chat.model.id,
  );
  const last = chat?.messages.at(-1);

  return (
    <ScreenLayout
      margin={
        <>
          <CommandButton shortcut="n" label="New chat" onClick={startNew} isQuiet />
          <CommandButton shortcut="l" label="Logins" onClick={onManageLogins} isQuiet />
          <div className={styles.chats}>
            <CommandButton shortcut="c" label="Chats" onClick={() => setView("chats")} isQuiet />
            <div className={styles.outline}>
              <PickList
                entries={(chats ?? []).map((saved) => ({ id: saved.id, name: saved.title }))}
                pickedId={chat?.id ?? undefined}
                onPick={open}
                isCompact
              />
            </div>
          </div>
        </>
      }
    >
      <div className={styles.column}>
        {chat === undefined ? <p className={styles.status}>Opening the chat.</p> : null}
        {chat !== undefined && shown === "chats" ? (
          <ChatList
            chats={chats}
            currentId={chat.id}
            onOpen={open}
            onClose={() => setView("chat")}
          />
        ) : null}
        {chat !== undefined && shown === "models" ? (
          <ModelPicker
            models={models}
            current={chat.model}
            onChoose={choose}
            {...(chat.model === null ? {} : { onClose: () => setView("chat") })}
          />
        ) : null}
        {chat !== undefined && shown === "chat" ? (
          <>
            <HeadingRow
              heading={
                <p className={styles.model}>
                  model <span className={styles.modelName}>{current?.name ?? chat.model?.id}</span>
                  {current === undefined ? null : ` from ${current.providerName}`}
                </p>
              }
              command={
                <CommandButton shortcut="m" label="Change model" onClick={openPicker} isQuiet />
              }
            />
            <ol className={styles.messages}>
              {chat.messages.map((message) => (
                <Message key={`${message.role}-${message.timestamp}`} message={message} />
              ))}
              {chat.isReplying && (reply !== "" || last?.role !== "assistant") ? (
                <li className={styles.message}>
                  <p className={styles.agent}>agent</p>
                  {reply === "" ? (
                    <p className={styles.status}>Thinking.</p>
                  ) : (
                    <p className={styles.text}>
                      {reply}
                      <span className={styles.caret} aria-hidden="true" />
                    </p>
                  )}
                </li>
              ) : null}
            </ol>
            {chat.messages.length === 0 && !chat.isReplying ? (
              <p className={styles.status}>No messages yet. Write the first one below.</p>
            ) : null}
            <form
              className={styles.composer}
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <TextField
                id="message"
                label="message"
                value={draft}
                onChange={setDraft}
                isMultiline
                placeholder="Write a message"
                onKeyDown={onFieldKey}
              />
              {chat.isReplying ? (
                <CommandButton shortcut="escape" label="Stop" onClick={stopReply} />
              ) : (
                <CommandButton shortcut="enter" label="Send" onClick={submit} />
              )}
            </form>
          </>
        ) : null}
        {notice === undefined ? null : <p className={styles.notice}>{notice}</p>}
        {connection === "reconnecting" ? (
          <p className={styles.status}>Reconnecting to Independum.</p>
        ) : null}
      </div>
    </ScreenLayout>
  );
}

/** Properties of one message. */
interface MessageProps {
  message: ChatMessage;
}

function Message({ message }: MessageProps): ReactElement {
  return (
    <li className={styles.message}>
      <p className={message.role === "user" ? styles.you : styles.agent}>
        {message.role === "user" ? "you" : "agent"}
      </p>
      {message.text === "" ? null : <p className={styles.text}>{message.text}</p>}
      {message.error === null ? null : <p className={styles.error}>{message.error}</p>}
    </li>
  );
}

// A screen with a hovering pointer most likely has a keyboard. On a touch screen, Enter adds a new
// line instead of sending, because a phone keyboard has no Shift and Enter for that.
function hasKeyboard(): boolean {
  return window.matchMedia("(hover: hover)").matches;
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
