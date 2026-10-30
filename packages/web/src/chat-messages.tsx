import type { ChatMessage, MessagePart, ThinkingPart, ToolCallPart } from "independum/api-types";
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
import { StepGroup } from "./step-group.tsx";
import { ThinkingMark } from "./thinking-mark.tsx";
import { ThoughtBox } from "./thought-box.tsx";
import { NoteStep, type ToolCalls, ToolStep } from "./tool-step.tsx";
import { type Typing, useTypedLength } from "./use-typed-length.ts";

/** Properties of the chat messages. */
interface ChatMessagesProps {
  chatId: string | null;
  messages: ChatMessage[];
  reply: MessagePart[];
  tools: ToolCalls;
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
  tools,
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

  const turns = turnsOf(messages);
  // A reply in progress joins the turns of the agent that answer the same prompt, or starts a reply
  // of its own.
  if (isReplying && turns.at(-1)?.type !== "reply") {
    turns.push({ type: "reply", index: messages.length, messages: [] });
  }

  return (
    <div ref={scroller} className={styles.scroller}>
      <ol ref={list} className={styles.messages} onCopy={copySelection}>
        {turns.map((turn, turnIndex) => {
          if (turn.type === "prompt") {
            const { message } = turn;
            return (
              <li
                key={`user-${message.timestamp}`}
                className={
                  turn.index >= opened.messageCount ? `${styles.user} ${styles.new}` : styles.user
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
          if (turn.type === "note") {
            return (
              <li key={`note-${turn.message.timestamp}`}>
                <NoteStep message={turn.message} />
              </li>
            );
          }
          const isCurrent = isReplying && turnIndex === turns.length - 1;
          return (
            <li key={`reply-${turn.index}`} className={styles.reply}>
              <Reply
                messages={turn.messages}
                live={isCurrent ? reply : []}
                tools={tools}
                isLive={isCurrent || turn.index + turn.messages.length > opened.messageCount}
                isStreaming={isCurrent}
                isLatest={turnIndex === turns.length - 1}
              />
            </li>
          );
        })}
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

/** A prompt of the user, or the turns of the agent that answer one, with their place in the chat. */
type Turn =
  | { type: "prompt"; index: number; message: ChatMessage }
  | { type: "note"; index: number; message: ChatMessage }
  | { type: "reply"; index: number; messages: ChatMessage[] };

/** A stretch of a reply: a text, thinking that runs on across parts, or a call to a tool. */
type ReplySegment =
  | { type: "text"; key: string; text: string }
  | { type: "thinking"; key: string; parts: ThinkingPart[] }
  | { type: "toolCall"; key: string; part: ToolCallPart };

/** A stretch of a reply that is one step of the work: thinking or a call to a tool. */
type StepSegment = Exclude<ReplySegment, { type: "text" }>;

/** A run of a reply: a text, or the steps that came one after another between two texts. */
type ReplyRun =
  | { type: "text"; segment: Extract<ReplySegment, { type: "text" }> }
  | {
      type: "steps";
      steps: StepSegment[];
    };

/** Properties of a reply. */
interface ReplyProps {
  messages: ChatMessage[];
  live: MessagePart[];
  tools: ToolCalls;
  isLive: boolean;
  isStreaming: boolean;
  isLatest: boolean;
}

// A reply holds every turn of the agent after one prompt, and the turn in progress, whose parts take
// the keys they keep once its message arrives.
function Reply({ messages, live, tools, isLive, isStreaming, isLatest }: ReplyProps): ReactElement {
  const body = useRef<HTMLDivElement>(null);
  const keyed = [
    ...messages.flatMap((message, at) =>
      message.parts.map((part, index) => ({ key: `${at}:${index}`, part })),
    ),
    ...live.map((part, index) => ({ key: `${messages.length}:${index}`, part })),
  ];
  const parts = keyed.map(({ part }) => part);
  const text = textOf(parts);
  const length = useTypedLength(text.length, isLive ? replyTyping : undefined);
  const isTyping = isStreaming || length < text.length;
  const segments = segmentsOf(keyed);
  const first = messages[0];
  const last = messages.at(-1);
  const error = last?.error ?? null;
  const durationMs =
    first !== undefined && last !== undefined && last.durationMs !== null
      ? last.timestamp + last.durationMs - first.timestamp
      : null;
  // The agent still works while it shows nothing new, such as when a tool has ended and the model
  // has not answered yet.
  const isWaiting =
    isStreaming &&
    !live.some((part) => part.type !== "text" || part.text !== "") &&
    !parts.some((part) => part.type === "toolCall" && part.result === null);
  // The text parts type in one after another, as one text, so each shows its share of what has
  // typed so far, and the caret sits in the one that is typing.
  let typedBefore = 0;

  function bodyNode(): Node {
    return body.current ?? document.createDocumentFragment();
  }

  function stepOf(segment: StepSegment): ReactElement {
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
    return (
      <ToolStep key={segment.key} part={segment.part} tools={tools} isReplying={isStreaming} />
    );
  }

  return (
    <>
      <div ref={body} className={styles.parts}>
        {runsOf(segments).map((run) => {
          if (run.type === "steps") {
            const isLast = run.steps.at(-1) === segments.at(-1);
            return run.steps.length === 1 ? (
              stepOf(run.steps[0] as StepSegment)
            ) : (
              <StepGroup
                key={`group-${run.steps[0]?.key}`}
                count={run.steps.length}
                isFollowing={isStreaming && isLast}
              >
                {run.steps.map(stepOf)}
              </StepGroup>
            );
          }
          const { segment } = run;
          const start = typedBefore;
          typedBefore += segment.text.length;
          const shown = segment.text.slice(0, Math.max(0, length - start));
          return shown === "" ? null : (
            <div key={segment.key} className={styles.text}>
              <MarkdownText text={shown} hasCaret={isTyping && length <= typedBefore} />
            </div>
          );
        })}
        {isWaiting ? (
          <div className={styles.thinking} data-copy="skip">
            <ThinkingLabel />
          </div>
        ) : null}
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
          {first === undefined ? null : (
            <span className={styles.when}>
              <MessageTime timestamp={first.timestamp} durationMs={durationMs} />
            </span>
          )}
        </div>
      )}
    </>
  );
}

function turnsOf(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const [index, message] of messages.entries()) {
    const last = turns.at(-1);
    if (message.role === "user") {
      turns.push({ type: "prompt", index, message });
    } else if (message.role === "note") {
      turns.push({ type: "note", index, message });
    } else if (last?.type === "reply") {
      last.messages.push(message);
    } else {
      turns.push({ type: "reply", index, messages: [message] });
    }
  }
  return turns;
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
// Each segment takes the key of its first part, which stays put while parts join.
function segmentsOf(parts: { key: string; part: MessagePart }[]): ReplySegment[] {
  const segments: ReplySegment[] = [];
  for (const { key, part } of parts) {
    const last = segments.at(-1);
    if (part.type === "thinking" && last?.type === "thinking") {
      last.parts.push(part);
    } else if (part.type === "thinking") {
      segments.push({ type: "thinking", key, parts: [part] });
    } else if (part.type === "toolCall") {
      segments.push({ type: "toolCall", key, part });
    } else if (part.text !== "") {
      segments.push({ type: "text", key, text: part.text });
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

// Steps that come one after another between two texts form one run, so they can show as a group.
function runsOf(segments: ReplySegment[]): ReplyRun[] {
  const runs: ReplyRun[] = [];
  for (const segment of segments) {
    const last = runs.at(-1);
    if (segment.type === "text") {
      runs.push({ type: "text", segment });
    } else if (last?.type === "steps") {
      last.steps.push(segment);
    } else {
      runs.push({ type: "steps", steps: [segment] });
    }
  }
  return runs;
}
