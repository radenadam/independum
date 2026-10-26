import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./prefers-reduced-motion.ts";

/** How a text types itself in: its steady pace, and whether it catches up when it falls behind. */
export interface Typing {
  charactersPerSecond: number;
  isCatchingUp: boolean;
}

// A text that falls behind catches up with this share of its backlog each second, so a fast model
// still reads as steady typing instead of lagging far behind.
const catchUpShare = 3;

/**
 * Returns how many characters of a text to show, which grow toward its full length while it
 * types, and show it whole when it does not.
 */
export function useTypedLength(length: number, typing: Typing | undefined): number {
  const shown = useRef(typing === undefined ? length : 0);
  const [typedLength, setTypedLength] = useState(shown.current);
  const pace = typing?.charactersPerSecond;
  const isCatchingUp = typing?.isCatchingUp === true;

  useEffect(() => {
    if (pace === undefined || prefersReducedMotion()) {
      shown.current = length;
      setTypedLength(length);
      return;
    }
    let frame = 0;
    let last = performance.now();
    function step(now: number): void {
      const backlog = length - shown.current;
      if (backlog <= 0 || pace === undefined) {
        shown.current = length;
        setTypedLength(length);
        return;
      }
      const speed = isCatchingUp ? Math.max(pace, backlog * catchUpShare) : pace;
      shown.current = Math.min(length, shown.current + (speed * (now - last)) / 1000);
      last = now;
      setTypedLength(Math.floor(shown.current));
      frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [length, pace, isCatchingUp]);

  return typedLength;
}
