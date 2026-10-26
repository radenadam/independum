import { type CSSProperties, type ReactElement, useLayoutEffect, useRef, useState } from "react";
import styles from "./sliding-title.module.css";
import { TypedText } from "./typed-text.tsx";
import { type Typing, useTypedLength } from "./use-typed-length.ts";

/** Properties of a sliding title. */
interface SlidingTitleProps {
  text: string;
  isTyped?: boolean;
}

// A title catches up on its backlog, so even a long one types in about half a second.
const titleTyping: Typing = { charactersPerSecond: 40, isCatchingUp: true };

/**
 * Draws a title on one line, which fades out at its end when it is too long and slides into view
 * while its row is hovered. A title that is typed when it first appears types itself in.
 */
export function SlidingTitle({ text, isTyped = false }: SlidingTitleProps): ReactElement {
  // Whether the title types is settled when it first appears, so it keeps typing after that.
  const [isTyping] = useState(isTyped);
  const shown = useTypedLength(text.length, isTyping ? titleTyping : undefined);
  const frame = useRef<HTMLSpanElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  // The part of the title that does not fit, which is how far it slides to come into view.
  const [hiddenWidth, setHiddenWidth] = useState(0);

  useLayoutEffect(() => {
    const frameElement = frame.current;
    const lineElement = line.current;
    if (frameElement === null || lineElement === null) {
      return;
    }
    function measure(): void {
      if (frameElement !== null && lineElement !== null) {
        const hidden = lineElement.offsetWidth - frameElement.clientWidth;
        setHiddenWidth(hidden > 1 ? hidden : 0);
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
      data-too-long={hiddenWidth > 0}
      style={{ "--hidden-width": `${hiddenWidth}px` } as CSSProperties}
    >
      <span ref={line} className={styles.line}>
        <TypedText text={text} shown={shown} hasCaret={shown < text.length} />
      </span>
    </span>
  );
}
