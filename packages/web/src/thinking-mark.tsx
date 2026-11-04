import type { ReactElement } from "react";
import { Mark } from "./mark.tsx";
import styles from "./thinking-mark.module.css";

/** Properties of the thinking mark. */
interface ThinkingMarkProps {
  isThinking: boolean;
}

/**
 * Draws the mark beside thinking, orange with its head tilting while the model thinks, and quiet
 * after. Pointing at its row turns the head to face forward.
 */
export function ThinkingMark({ isThinking }: ThinkingMarkProps): ReactElement {
  return (
    <span className={styles.mark} data-thinking={isThinking}>
      <Mark turn="profile" className={styles.profile} />
      <Mark turn="tilt" className={styles.tilt} />
      <Mark turn="front" className={styles.front} />
    </span>
  );
}
