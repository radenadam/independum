import type { ChatMessage } from "independum/api-types";
import { type ReactElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./chat-messages.module.css";
import { CopyButton } from "./copy-button.tsx";
import { Mark } from "./mark.tsx";
import { MarkdownText } from "./markdown-text.tsx";
import { MessageTime } from "./message-time.tsx";
import { prefersReducedMotion } from "./prefers-reduced-motion.ts";
import { type Typing, useTypedLength } from "./use-typed-length.ts";

/** Properties of the chat messages. */
interface ChatMessagesProps {
  chatId: string | null;
  messages: ChatMessage[];
  reply: string;
  isReplying: boolean;
}

// The space kept above a message that is scrolled to the top of the chat.
const topGap = 16;
const thinkingText = "Thinking";
const thinkingTyping: Typing = { charactersPerSecond: 14, isCatchingUp: false };
const replyTyping: Typing = { charactersPerSecond: 90, isCatchingUp: true };

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
  const list = useRef<HTMLOListElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const seen = useRef<{ chatId: string | null; userCount: number } | undefined>(undefined);
  const isAnchored = useRef(false);
  // Messages that arrive after the chat opens rise or type into view, but the ones it opened with
  // do not.
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
    const anchor = fitSpacer(scrollerElement, spacerElement, isAnchored.current);
    if (isSent && anchor !== null) {
      scrollerElement.scrollTo({
        top: anchor.offsetTop - topGap,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  });

  // A reply keeps typing after its last render here, so the spacer follows the size of the list.
  useEffect(() => {
    const scrollerElement = scroller.current;
    const listElement = list.current;
    const spacerElement = spacer.current;
    if (scrollerElement === null || listElement === null || spacerElement === null) {
      return;
    }
    const observer = new ResizeObserver(() =>
      fitSpacer(scrollerElement, spacerElement, isAnchored.current),
    );
    observer.observe(listElement);
    return () => observer.disconnect();
  }, []);

  const last = messages.at(-1);
  const isReplyShown = isReplying && (reply !== "" || last?.role !== "assistant");
  // The reply in progress and the message it becomes share one place in the list, so its typing
  // carries on when the reply ends.
  const liveIndex =
    last?.role === "assistant" && messages.length - 1 >= opened.messageCount
      ? messages.length - 1
      : -1;

  return (
    <div ref={scroller} className={styles.scroller}>
      <ol ref={list} className={styles.messages}>
        {messages.map((message, index) => {
          if (message.role === "user") {
            return (
              <li
                key={`user-${message.timestamp}`}
                className={
                  index >= opened.messageCount ? `${styles.user} ${styles.new}` : styles.user
                }
                data-user
              >
                <p className={styles.bubble}>{message.text}</p>
                <div className={styles.actions}>
                  <span className={styles.when}>
                    <MessageTime timestamp={message.timestamp} durationMs={null} />
                  </span>
                  <CopyButton text={message.text} label="Copy message" tipAlign="end" />
                </div>
              </li>
            );
          }
          return index === liveIndex ? null : (
            <li key={`assistant-${message.timestamp}`} className={styles.reply}>
              <Reply
                text={message.text}
                error={message.error}
                isLive={false}
                isStreaming={false}
                isLatest={index === messages.length - 1}
                timestamp={message.timestamp}
                durationMs={message.durationMs}
              />
            </li>
          );
        })}
        {isReplyShown && reply === "" ? (
          <li className={styles.thinking}>
            <ThinkingLabel />
          </li>
        ) : null}
        {isReplyShown && reply !== "" ? (
          <li key="live" className={styles.reply}>
            <Reply
              text={reply}
              error={null}
              isLive
              isStreaming
              isLatest
              timestamp={null}
              durationMs={null}
            />
          </li>
        ) : last !== undefined && liveIndex !== -1 ? (
          <li key="live" className={styles.reply}>
            <Reply
              text={last.text}
              error={last.error}
              isLive
              isStreaming={false}
              isLatest
              timestamp={last.timestamp}
              durationMs={last.durationMs}
            />
          </li>
        ) : null}
      </ol>
      <div ref={spacer} className={styles.spacer} aria-hidden="true" />
    </div>
  );
}

/** Properties of a reply. */
interface ReplyProps {
  text: string;
  error: string | null;
  isLive: boolean;
  isStreaming: boolean;
  isLatest: boolean;
  timestamp: number | null;
  durationMs: number | null;
}

function Reply({
  text,
  error,
  isLive,
  isStreaming,
  isLatest,
  timestamp,
  durationMs,
}: ReplyProps): ReactElement {
  const length = useTypedLength(text.length, isLive ? replyTyping : undefined);
  const isTyping = isStreaming || length < text.length;
  return (
    <>
      {text === "" ? null : <MarkdownText text={text.slice(0, length)} hasCaret={isTyping} />}
      {error === null || isTyping ? null : <p className={styles.error}>{error}</p>}
      {text === "" || isTyping ? null : (
        <div className={styles.actions} data-latest={isLatest}>
          <CopyButton text={text} label="Copy reply" tipAlign="start" />
          {timestamp === null ? null : (
            <span className={styles.when}>
              <MessageTime timestamp={timestamp} durationMs={durationMs} />
            </span>
          )}
        </div>
      )}
    </>
  );
}

function ThinkingLabel(): ReactElement {
  const length = useTypedLength(thinkingText.length, thinkingTyping);
  return (
    <>
      <span className={styles.raven}>
        <Mark />
      </span>
      <MarkdownText text={thinkingText.slice(0, length)} hasCaret />
    </>
  );
}

// The spacer fills the space under the anchored message and shrinks as the reply grows, so the
// message stays at the top until the reply needs the room. The end of the messages is the top of
// the spacer, because a short chat reports the height of the scroller instead of its content.
function fitSpacer(
  scroller: HTMLElement,
  spacer: HTMLElement,
  isAnchored: boolean,
): HTMLElement | null {
  const anchor = isAnchored
    ? ([...scroller.querySelectorAll<HTMLElement>("[data-user]")].at(-1) ?? null)
    : null;
  const nextHeight =
    anchor === null
      ? 0
      : Math.max(0, scroller.clientHeight - (spacer.offsetTop - anchor.offsetTop) - topGap);
  if (Math.abs(nextHeight - spacer.offsetHeight) > 1) {
    spacer.style.height = `${nextHeight}px`;
  }
  return anchor;
}
