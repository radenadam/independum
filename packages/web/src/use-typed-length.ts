import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./prefers-reduced-motion.ts";

// A text that falls behind catches up with this share of its backlog each second, so a fast model
// still reads as steady typing instead of lagging far behind.
const catchUpShare = 3;

/**
 * Returns how many characters of a text to show, which grow toward its full length at a steady
 * pace while typing is on.
 */
export function useTypedLength(
  text: string,
  isTyping: boolean,
  charactersPerSecond: number,
): number {
  const target = text.length;
  const shown = useRef(isTyping ? 0 : target);
  const [length, setLength] = useState(shown.current);

  useEffect(() => {
    if (!isTyping || prefersReducedMotion()) {
      shown.current = target;
      setLength(target);
      return;
    }
    let frame = 0;
    let last = performance.now();
    function step(now: number): void {
      const backlog = target - shown.current;
      if (backlog <= 0) {
        shown.current = target;
        setLength(target);
        return;
      }
      const pace = Math.max(charactersPerSecond, backlog * catchUpShare);
      shown.current = Math.min(target, shown.current + (pace * (now - last)) / 1000);
      last = now;
      setLength(Math.floor(shown.current));
      frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, isTyping, charactersPerSecond]);

  return length;
}
