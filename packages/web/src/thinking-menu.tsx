import type { ChatState } from "independum/api-types";
import type { CSSProperties, ReactElement } from "react";
import { describeThinking } from "./describe-thinking.ts";
import styles from "./thinking-menu.module.css";

/** Properties of the thinking menu. */
interface ThinkingMenuProps {
  thinking: NonNullable<ChatState["thinking"]>;
  onChoose: (level: string) => void;
}

/** Draws a slider over the thinking levels that the model offers, with each level named below. */
export function ThinkingMenu({ thinking, onChoose }: ThinkingMenuProps): ReactElement {
  const { levels } = thinking;
  const index = Math.max(0, levels.indexOf(thinking.level));
  const last = Math.max(1, levels.length - 1);
  const variables = {
    "--count": levels.length,
    "--ratio": index / last,
  } as CSSProperties;

  return (
    <div className={styles.menu} style={variables}>
      <h2 className={styles.heading}>Thinking effort</h2>
      <div className={styles.slider}>
        <span className={styles.track} aria-hidden="true" />
        <span className={styles.handle} aria-hidden="true" />
        <input
          className={styles.input}
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          aria-label="Thinking effort"
          aria-valuetext={describeThinking(thinking.level)}
          onChange={(event) => {
            const level = levels[Number(event.target.value)];
            if (level !== undefined) {
              onChoose(level);
            }
          }}
        />
      </div>
      <div className={styles.levels}>
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            className={styles.level}
            aria-pressed={level === thinking.level}
            onClick={() => onChoose(level)}
          >
            {describeThinking(level)}
          </button>
        ))}
      </div>
    </div>
  );
}
