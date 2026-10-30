import { type CSSProperties, type ReactElement, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./one-line-title.module.css";
import { TypedText } from "./typed-text.tsx";
import { type Typing, useTypedLength } from "./use-typed-length.ts";

/** Properties of a one line title. */
interface OneLineTitleProps {
  text: string;
  isTyped?: boolean;
  align?: "start" | "end";
}

// A title catches up on its backlog, so even a long one types in about half a second.
const titleTyping: Typing = { charactersPerSecond: 40, isCatchingUp: true };
const tooltipWidth = 420;
const edge = 16;

/**
 * Draws a title on one line, which fades out at its end when it is too long and then shows the
 * whole title in a tooltip while the pointer rests on it. A title that is typed when it first
 * appears types itself in, and a title aligned to the end sits there while it fits.
 */
export function OneLineTitle({
  text,
  isTyped = false,
  align = "start",
}: OneLineTitleProps): ReactElement {
  // Whether the title types is settled when it first appears, so it keeps typing after that.
  const [isTyping] = useState(isTyped);
  const shown = useTypedLength(text.length, isTyping ? titleTyping : undefined);
  const frame = useRef<HTMLSpanElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const [isCut, setIsCut] = useState(false);
  const [tooltip, setTooltip] = useState<{ left: number; top: number } | undefined>();

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

  // The tooltip sits on the page, so the clipped row of the title does not cut it, and it stays
  // inside the window.
  function showTooltip(): void {
    const box = frame.current?.getBoundingClientRect();
    if (!isCut || box === undefined) {
      return;
    }
    const left = Math.max(edge, Math.min(box.left, window.innerWidth - edge - tooltipWidth));
    setTooltip({ left, top: box.bottom + 6 });
  }

  return (
    <span
      ref={frame}
      className={styles.frame}
      data-too-long={isCut}
      data-align={align}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          showTooltip();
        }
      }}
      onPointerLeave={() => setTooltip(undefined)}
    >
      <span ref={line} className={styles.line}>
        <TypedText text={text} shown={shown} hasCaret={shown < text.length} />
      </span>
      {tooltip === undefined
        ? null
        : createPortal(
            <span
              className={styles.tooltip}
              role="tooltip"
              style={
                { "--left": `${tooltip.left}px`, "--top": `${tooltip.top}px` } as CSSProperties
              }
            >
              {text}
            </span>,
            document.body,
          )}
    </span>
  );
}
