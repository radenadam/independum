import type { ReactElement } from "react";
import { Mark } from "./mark.tsx";
import styles from "./thinking-mark.module.css";

/** Properties of the thinking mark. */
interface ThinkingMarkProps {
  isThinking: boolean;
}

/** Draws the mark beside thinking, orange and breathing while the model thinks, and quiet after. */
export function ThinkingMark({ isThinking }: ThinkingMarkProps): ReactElement {
  return (
    <span className={styles.mark} data-thinking={isThinking}>
      <Mark />
    </span>
  );
}
