import { type ReactElement, useLayoutEffect, useRef, useState } from "react";
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
  const [isTooLong, setIsTooLong] = useState(false);

  useLayoutEffect(() => {
    const frameElement = frame.current;
    const lineElement = line.current;
    if (frameElement === null || lineElement === null) {
      return;
    }
    function measure(): void {
      if (frameElement !== null && lineElement !== null) {
        setIsTooLong(lineElement.offsetWidth > frameElement.clientWidth + 1);
      }
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frameElement);
    observer.observe(lineElement);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={frame} className={styles.frame} data-too-long={isTooLong}>
      <span ref={line} className={styles.line}>
        {text}
      </span>
    </span>
  );
}
