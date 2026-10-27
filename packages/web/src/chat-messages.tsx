import type { ChatMessage, MessagePart, ThinkingPart } from "independum/api-types";
import {
  type ClipboardEvent,
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styles from "./chat-messages.module.css";
import { clipboardHtml, clipboardText } from "./clipboard-content.ts";
import { CopyButton } from "./copy-button.tsx";
import { IconButton } from "./icon-button.tsx";
import { MarkdownText } from "./markdown-text.tsx";
import { MessageTime } from "./message-time.tsx";
import { prefersReducedMotion } from "./prefers-reduced-motion.ts";
import { ThinkingMark } from "./thinking-mark.tsx";
import { ThoughtBox } from "./thought-box.tsx";
import { type Typing, useTypedLength } from "./use-typed-length.ts";

/** Properties of the chat messages. */
interface ChatMessagesProps {
  chatId: string | null;
  messages: ChatMessage[];
  reply: MessagePart[];
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
  const end = useRef<HTMLDivElement>(null);
  const [isEndBelow, setIsEndBelow] = useState(false);
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

  // The way back to the latest message shows while the end of the messages sits below the view,
  // such as when the user scrolls up while a reply types.
  useEffect(() => {
    const scrollerElement = scroller.current;
    const endElement = end.current;
    if (scrollerElement === null || endElement === null) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry !== undefined) {
          const viewBottom = entry.rootBounds?.bottom ?? 0;
          setIsEndBelow(!entry.isIntersecting && entry.boundingClientRect.top > viewBottom);
        }
      },
      // An end that lands right on the bottom edge after a jump counts as in view.
      { root: scrollerElement, rootMargin: "0px 0px 8px 0px" },
    );
    observer.observe(endElement);
    return () => observer.disconnect();
  }, []);

  function showLatest(): void {
    end.current?.scrollIntoView({
      block: "end",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  const last = messages.at(-1);
  const hasReply = reply.some((part) => part.type === "thinking" || part.text !== "");
  const isReplyShown = isReplying && (hasReply || last?.role !== "assistant");
  // The reply in progress and the message it becomes share one place in the list, so its typing
  // carries on when the reply ends.
  const liveIndex =
    last?.role === "assistant" && messages.length - 1 >= opened.messageCount
      ? messages.length - 1
      : -1;

  return (
    <div ref={scroller} className={styles.scroller}>
      <ol ref={list} className={styles.messages} onCopy={copySelection}>
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
                <p className={styles.bubble}>{textOf(message.parts)}</p>
                <div className={styles.actions} data-copy="skip">
                  <span className={styles.when}>
                    <MessageTime timestamp={message.timestamp} durationMs={null} />
                  </span>
                  <CopyButton text={textOf(message.parts)} label="Copy message" tipAlign="end" />
                </div>
              </li>
            );
          }
          return index === liveIndex ? null : (
            <li key={`assistant-${message.timestamp}`} className={styles.reply}>
              <Reply
                parts={message.parts}
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
        {isReplyShown && !hasReply ? (
          <li className={styles.thinking} data-copy="skip">
            <ThinkingLabel />
          </li>
        ) : null}
        {isReplyShown && hasReply ? (
          <li key="live" className={styles.reply}>
            <Reply
              parts={reply}
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
              parts={last.parts}
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
      <div ref={end} />
      <div ref={spacer} className={styles.spacer} aria-hidden="true" />
      <div className={styles.latest} data-shown={isEndBelow}>
        <span className={styles.latestButton}>
          <IconButton
            icon="latest"
            label="Jump to the latest message"
            tipSide="above"
            isRound
            onClick={showLatest}
          />
        </span>
      </div>
    </div>
  );
}

/** A stretch of a reply: a text, or thinking that runs on across one or more parts. */
type ReplySegment =
  | { type: "text"; key: number; text: string }
  | { type: "thinking"; key: number; parts: ThinkingPart[] };

/** Properties of a reply. */
interface ReplyProps {
  parts: MessagePart[];
  error: string | null;
  isLive: boolean;
  isStreaming: boolean;
  isLatest: boolean;
  timestamp: number | null;
  durationMs: number | null;
}

function Reply({
  parts,
  error,
  isLive,
  isStreaming,
  isLatest,
  timestamp,
  durationMs,
}: ReplyProps): ReactElement {
  const body = useRef<HTMLDivElement>(null);
  const text = textOf(parts);
  const length = useTypedLength(text.length, isLive ? replyTyping : undefined);
  const isTyping = isStreaming || length < text.length;
  const segments = segmentsOf(parts);
  // The text parts type in one after another, as one text, so each shows its share of what has
  // typed so far, and the caret sits in the one that is typing.
  let typedBefore = 0;

  function bodyNode(): Node {
    return body.current ?? document.createDocumentFragment();
  }

  return (
    <>
      <div ref={body}>
        {segments.map((segment) => {
          if (segment.type === "thinking") {
            // The model still thinks while nothing has come after its thoughts.
            return (
              <ThoughtBox
                key={segment.key}
                parts={segment.parts}
                isLive={isLive}
                isThinking={isStreaming && segment === segments.at(-1)}
              />
            );
          }
          const start = typedBefore;
          typedBefore += segment.text.length;
          const shown = segment.text.slice(0, Math.max(0, length - start));
          return shown === "" ? null : (
            <MarkdownText
              key={segment.key}
              text={shown}
              hasCaret={isTyping && length <= typedBefore}
            />
          );
        })}
      </div>
      {error === null || isTyping ? null : <p className={styles.error}>{error}</p>}
      {text === "" || isTyping ? null : (
        <div className={styles.actions} data-latest={isLatest} data-copy="skip">
          <CopyButton
            text={text}
            html={() => clipboardHtml(bodyNode())}
            label="Copy reply"
            tipAlign="start"
            options={[
              { label: "Copy as Markdown", content: () => ({ text }) },
              {
                label: "Copy as plain text",
                content: () => ({ text: clipboardText(bodyNode(), "plain") }),
              },
            ]}
          />
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

// A selection in the chat copies as Markdown in its plain text, and with its formatting for the
// places that take it, without the buttons and times inside it. A selection inside a block of code
// keeps the copy of the browser, which keeps the code exactly.
function copySelection(event: ClipboardEvent<HTMLOListElement>): void {
  const selection = document.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element = container instanceof Element ? container : container.parentElement;
  if (element?.closest("pre") !== null) {
    return;
  }
  const copied = range.cloneContents();
  event.preventDefault();
  event.clipboardData.setData("text/plain", clipboardText(copied, "markdown"));
  event.clipboardData.setData("text/html", clipboardHtml(copied));
}

// Thinking that runs on across several parts, as an OpenAI model sends it, reads as one stretch.
// Each segment takes the place of its first part as its key, which stays put while parts join.
function segmentsOf(parts: MessagePart[]): ReplySegment[] {
  const segments: ReplySegment[] = [];
  for (const [index, part] of parts.entries()) {
    const last = segments.at(-1);
    if (part.type === "thinking" && last?.type === "thinking") {
      last.parts.push(part);
    } else if (part.type === "thinking") {
      segments.push({ type: "thinking", key: index, parts: [part] });
    } else if (part.text !== "") {
      segments.push({ type: "text", key: index, text: part.text });
    }
  }
  return segments;
}

function textOf(parts: MessagePart[]): string {
  return parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function ThinkingLabel(): ReactElement {
  const length = useTypedLength(thinkingText.length, thinkingTyping);
  return (
    <>
      <ThinkingMark isThinking />
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
