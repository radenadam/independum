import type { ChatMessage } from "independum/api-types";
import { type ReactElement, useLayoutEffect, useRef, useState } from "react";
import styles from "./chat-messages.module.css";
import { Mark } from "./mark.tsx";

/** Properties of the chat messages. */
interface ChatMessagesProps {
  chatId: string | null;
  messages: ChatMessage[];
  reply: string;
  isReplying: boolean;
}

// The space kept above a message that is scrolled to the top of the chat.
const topGap = 16;

/**
 * Draws the messages of the open chat and the reply in progress, and scrolls a message the user
 * sends to the top, with room below it for the reply.
 */
export function ChatMessages({
  chatId,
  messages,
  reply,
  isReplying,
}: ChatMessagesProps): ReactElement {
  const scroller = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const seen = useRef<{ chatId: string | null; userCount: number } | undefined>(undefined);
  const isAnchored = useRef(false);
  // Messages that arrive after the chat opens rise into view, but the ones it opened with do not.
  const [opened, setOpened] = useState({ chatId, messageCount: messages.length });
  if (opened.chatId !== chatId) {
    setOpened({ chatId, messageCount: messages.length });
  }
  const userCount = messages.filter((message) => message.role === "user").length;

  useLayoutEffect(() => {
    const scrollerElement = scroller.current;
    const spacerElement = spacer.current;
    if (scrollerElement === null || spacerElement === null) {
      return;
    }
    if (seen.current?.chatId !== chatId) {
      seen.current = { chatId, userCount };
      isAnchored.current = false;
      spacerElement.style.height = "0px";
      scrollerElement.scrollTop = scrollerElement.scrollHeight;
      return;
    }
    const isSent = userCount > seen.current.userCount;
    seen.current.userCount = userCount;
    if (isSent) {
      isAnchored.current = true;
    }
    // The spacer fills the space under the anchored message and shrinks as the reply grows, so
    // the message stays at the top until the reply needs the room.
    const anchor = isAnchored.current
      ? ([...scrollerElement.querySelectorAll<HTMLElement>("[data-user]")].at(-1) ?? null)
      : null;
    const spacerHeight = spacerElement.offsetHeight;
    let nextHeight = 0;
    if (anchor !== null) {
      const below = spacerElement.offsetTop - anchor.offsetTop;
      nextHeight = Math.max(0, scrollerElement.clientHeight - below - topGap);
    }
    if (Math.abs(nextHeight - spacerHeight) > 1) {
      spacerElement.style.height = `${nextHeight}px`;
    }
    if (isSent && anchor !== null) {
      const isCalm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollerElement.scrollTo({
        top: anchor.offsetTop - topGap,
        behavior: isCalm ? "auto" : "smooth",
      });
    }
  });

  const last = messages.at(-1);
  const isReplyShown = isReplying && (reply !== "" || last?.role !== "assistant");

  return (
    <div ref={scroller} className={styles.scroller}>
      <ol className={styles.messages}>
        {messages.map((message, index) =>
          message.role === "user" ? (
            <li
              key={`user-${message.timestamp}`}
              className={
                index >= opened.messageCount ? `${styles.user} ${styles.new}` : styles.user
              }
              data-user
            >
              <p className={styles.bubble}>{message.text}</p>
            </li>
          ) : (
            <li key={`assistant-${message.timestamp}`}>
              {message.text === "" ? null : <p className={styles.reply}>{message.text}</p>}
              {message.error === null ? null : <p className={styles.error}>{message.error}</p>}
            </li>
          ),
        )}
        {isReplyShown && reply === "" ? (
          <li className={styles.thinking}>
            <span className={styles.raven}>
              <Mark />
            </span>
            Thinking
          </li>
        ) : null}
        {isReplyShown && reply !== "" ? (
          <li>
            <p className={styles.reply}>
              {reply}
              <span className={styles.caret} aria-hidden="true" />
            </p>
          </li>
        ) : null}
      </ol>
      <div ref={spacer} className={styles.spacer} aria-hidden="true" />
    </div>
  );
}
