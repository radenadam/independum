import type { ThinkingPart } from "independum/api-types";
import { type ReactElement, useLayoutEffect, useRef, useState } from "react";
import { describeDuration } from "./describe-duration.ts";
import { Icon } from "./icon.tsx";
import { MarkdownText } from "./markdown-text.tsx";
import { ThinkingMark } from "./thinking-mark.tsx";
import styles from "./thought-box.module.css";
import { type Typing, useTypedLength } from "./use-typed-length.ts";

/** Properties of a thought box. */
interface ThoughtBoxProps {
  parts: ThinkingPart[];
  isLive: boolean;
  isThinking: boolean;
}

const thoughtTyping: Typing = { charactersPerSecond: 160, isCatchingUp: true };

/**
 * Draws what the model thought in a box of its own, set apart from the reply, with the time of all
 * its parts. The box stays open while the model thinks, so the thoughts stream in, and folds away
 * once the model goes on.
 */
export function ThoughtBox({ parts, isLive, isThinking }: ThoughtBoxProps): ReactElement {
  // The box follows the thinking until the user opens or closes it.
  const [choice, setChoice] = useState<boolean | undefined>();
  const [isClipped, setIsClipped] = useState(false);
  const view = useRef<HTMLDivElement>(null);
  const text = parts
    .map((part) => part.text)
    .filter((thought) => thought !== "")
    .join("\n\n");
  const isHidden = text === "" && parts.some((part) => part.isRedacted);
  const timed = parts.flatMap((part) => (part.durationMs === null ? [] : [part.durationMs]));
  const length = useTypedLength(text.length, isLive ? thoughtTyping : undefined);
  const hasBody = text !== "" || isHidden;
  const isOpen = hasBody && (choice ?? isThinking);
  const label = isThinking
    ? "Thinking"
    : timed.length === 0
      ? "Thought"
      : `Thought for ${describeDuration(timed.reduce((sum, durationMs) => sum + durationMs, 0))}`;
  const header = (
    <>
      <ThinkingMark isThinking={isThinking} />
      <span className={styles.label}>{label}</span>
    </>
  );

  // The top of the thoughts fades only once the latest lines push the first ones out of view.
  useLayoutEffect(() => {
    const element = view.current;
    const content = element?.firstElementChild;
    if (element !== null && content instanceof HTMLElement) {
      setIsClipped(content.offsetHeight > element.clientHeight + 1);
    }
  });

  return (
    <div
      className={styles.box}
      data-open={isOpen}
      data-following={choice === undefined}
      data-copy="skip"
    >
      {hasBody ? (
        <button
          type="button"
          className={styles.header}
          aria-expanded={isOpen}
          onClick={() => setChoice(!isOpen)}
        >
          {header}
          <span className={styles.chevron}>
            <Icon name="expand" size={15} />
          </span>
        </button>
      ) : (
        <p className={styles.header}>{header}</p>
      )}
      <div className={styles.body} inert={!isOpen}>
        <div className={styles.clip}>
          <div className={styles.thought}>
            <div ref={view} className={styles.view} data-clipped={isClipped}>
              {isHidden ? (
                <p className={styles.note}>The provider hid this thinking.</p>
              ) : (
                <MarkdownText
                  text={text.slice(0, length)}
                  hasCaret={isThinking || length < text.length}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
