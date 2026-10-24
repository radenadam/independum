import type { ChatEvent, ChatMessage, ChatState, ModelSummary } from "independum/api-types";
import { type KeyboardEvent, type ReactElement, useCallback, useEffect, useState } from "react";
import {
  type ChatConnection,
  chooseModel,
  fetchModels,
  followChat,
  sendMessage,
  startNewChat,
  stopReply,
} from "./chat-api.ts";
import styles from "./chat-screen.module.css";
import { CommandButton } from "./command-button.tsx";
import { ModelPicker } from "./model-picker.tsx";
import { ScreenLayout } from "./screen-layout.tsx";
import { TextField } from "./text-field.tsx";

/** Properties of the chat screen. */
interface ChatScreenProps {
  onManageLogins: () => void;
  onExpiredLink: () => void;
}

/** Draws the chat with its messages, the reply as it streams, the message field, and the models. */
export function ChatScreen({ onManageLogins, onExpiredLink }: ChatScreenProps): ReactElement {
  const [chat, setChat] = useState<ChatState | undefined>();
  const [reply, setReply] = useState("");
  const [connection, setConnection] = useState<ChatConnection>("following");
  const [models, setModels] = useState<ModelSummary[] | undefined>();
  const [isPicking, setIsPicking] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | undefined>();

  const loadModels = useCallback((): void => {
    fetchModels().then(setModels, () => setModels([]));
  }, []);

  useEffect(() => {
    loadModels();
    return followChat(
      (event) => {
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

  const isPickerShown = chat !== undefined && (isPicking || chat.model === null);
  const messageCount = chat?.messages.length ?? 0;

  // Keeps the newest message in view, and puts the cursor in the message field on screens with a
  // pointer, where a keyboard is likely.
  useEffect(() => {
    if (isPickerShown) {
      return;
    }
    if (messageCount > 0 || reply !== "") {
      window.scrollTo({ top: document.body.scrollHeight });
    }
    if (window.matchMedia("(hover: hover)").matches) {
      document.getElementById("message")?.focus();
    }
  }, [isPickerShown, messageCount, reply]);

  function openPicker(): void {
    loadModels();
    setIsPicking(true);
  }

  function choose(model: ModelSummary): void {
    setNotice(undefined);
    chooseModel(model.providerId, model.id).then(
      () => setIsPicking(false),
      () => setNotice("That model is not available. Choose another one."),
    );
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
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
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
      aside={
        <>
          <CommandButton shortcut="n" label="New chat" onClick={startNewChat} isQuiet />
          <CommandButton shortcut="m" label="Change model" onClick={openPicker} isQuiet />
          <CommandButton shortcut="l" label="Manage logins" onClick={onManageLogins} isQuiet />
        </>
      }
    >
      <div className={styles.column}>
        {chat === undefined ? <p className={styles.status}>Opening the chat.</p> : null}
        {isPickerShown ? (
          <ModelPicker
            models={models}
            current={chat.model}
            onChoose={choose}
            {...(chat.model === null ? {} : { onClose: () => setIsPicking(false) })}
          />
        ) : null}
        {chat === undefined || isPickerShown ? null : (
          <>
            <p className={styles.model}>
              model <span className={styles.modelName}>{current?.name ?? chat.model?.id}</span>
              {current === undefined ? null : ` from ${current.providerName}`}
            </p>
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
        )}
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
