import type { ThinkingPart } from "independum/api-types";
import type { ReactElement } from "react";
import { describeDuration } from "./describe-duration.ts";
import { MarkdownText } from "./markdown-text.tsx";
import { StepBox } from "./step-box.tsx";
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
 * Draws what the model thought as a step of its own, with the time of all its parts. The box stays
 * open while the model thinks, so the thoughts stream in, and folds away once the model goes on.
 */
export function ThoughtBox({ parts, isLive, isThinking }: ThoughtBoxProps): ReactElement {
  const text = parts
    .map((part) => part.text)
    .filter((thought) => thought !== "")
    .join("\n\n");
  const isHidden = text === "" && parts.some((part) => part.isRedacted);
  const timed = parts.flatMap((part) => (part.durationMs === null ? [] : [part.durationMs]));
  const length = useTypedLength(text.length, isLive ? thoughtTyping : undefined);
  const label = isThinking
    ? "Thinking"
    : timed.length === 0
      ? "Thought"
      : `Thought for ${describeDuration(timed.reduce((sum, durationMs) => sum + durationMs, 0))}`;

  return (
    <StepBox
      leading={<ThinkingMark isThinking={isThinking} />}
      label={label}
      isFollowing={isThinking}
      hasBody={text !== "" || isHidden}
    >
      <div className={styles.thought}>
        {isHidden ? (
          <p className={styles.note}>The provider hid this thinking.</p>
        ) : (
          <MarkdownText
            text={text.slice(0, length)}
            hasCaret={isThinking || length < text.length}
          />
        )}
      </div>
    </StepBox>
  );
}
