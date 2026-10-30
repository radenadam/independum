import { type ReactElement, useLayoutEffect, useRef, useState } from "react";
import styles from "./one-line-title.module.css";
import { TypedText } from "./typed-text.tsx";
import { useTooltip } from "./use-tooltip.tsx";
import { type Typing, useTypedLength } from "./use-typed-length.ts";

/** Properties of a one line title. */
interface OneLineTitleProps {
  text: string;
  tooltip?: string;
  isTyped?: boolean;
  align?: "start" | "end";
}

// A title catches up on its backlog, so even a long one types in about half a second.
const titleTyping: Typing = { charactersPerSecond: 40, isCatchingUp: true };

/**
 * Draws a title on one line, which fades out at its end when it is too long and then shows the
 * whole title in a tooltip while the pointer rests on it. A given tooltip, such as the path of a
 * folder, shows in its place whether the title fits or not. A title that is typed when it first
 * appears types itself in, and a title aligned to the end sits there while it fits.
 */
export function OneLineTitle({
  text,
  tooltip,
  isTyped = false,
  align = "start",
}: OneLineTitleProps): ReactElement {
  // Whether the title types is settled when it first appears, so it keeps typing after that.
  const [isTyping] = useState(isTyped);
  const shown = useTypedLength(text.length, isTyping ? titleTyping : undefined);
  const frame = useRef<HTMLSpanElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const [isCut, setIsCut] = useState(false);
  const tip = useTooltip(tooltip ?? (isCut ? text : undefined));

  useLayoutEffect(() => {
    const frameElement = frame.current;
    const lineElement = line.current;
    if (frameElement === null || lineElement === null) {
      return;
    }
    function measure(): void {
      if (frameElement !== null && lineElement !== null) {
        setIsCut(lineElement.offsetWidth - frameElement.clientWidth > 1);
      }
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frameElement);
    observer.observe(lineElement);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={frame}
      className={styles.frame}
      data-too-long={isCut}
      data-align={align}
      {...tip.handlers}
    >
      <span ref={line} className={styles.line}>
        <TypedText text={text} shown={shown} hasCaret={shown < text.length} />
      </span>
      {tip.tooltip}
    </span>
  );
}
