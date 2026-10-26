import { type CSSProperties, type ReactElement, useLayoutEffect, useRef, useState } from "react";
import styles from "./sliding-title.module.css";

/** Properties of a sliding title. */
interface SlidingTitleProps {
  text: string;
}

/**
 * Draws a title on one line, which fades out at its end when it is too long and slides into view
 * while its row is hovered.
 */
export function SlidingTitle({ text }: SlidingTitleProps): ReactElement {
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
        {text}
      </span>
    </span>
  );
}
