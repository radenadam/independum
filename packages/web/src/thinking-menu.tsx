import type { ChatState } from "independum/api-types";
import { type CSSProperties, type ReactElement, useEffect, useRef } from "react";
import { describeThinking } from "./describe-thinking.ts";
import { hasKeyboard } from "./has-keyboard.ts";
import styles from "./thinking-menu.module.css";
import { thinkingRatio } from "./thinking-ratio.ts";

/** Properties of the thinking menu. */
interface ThinkingMenuProps {
  thinking: NonNullable<ChatState["thinking"]>;
  modelName: string;
  onChoose: (level: string) => void;
}

/**
 * Draws the chosen thinking level and the model, over a slider with a stop for each level that the
 * model offers.
 */
export function ThinkingMenu({ thinking, modelName, onChoose }: ThinkingMenuProps): ReactElement {
  const slider = useRef<HTMLInputElement>(null);
  const { levels } = thinking;
  const last = Math.max(1, levels.length - 1);
  const ratio = thinkingRatio(thinking);

  useEffect(() => {
    if (hasKeyboard()) {
      slider.current?.focus();
    }
  }, []);

  return (
    <div className={styles.menu} style={{ "--ratio": ratio } as CSSProperties}>
      <p className={styles.summary}>
        <span className={styles.level}>{describeThinking(thinking.level)}</span>
        <span className={styles.model}>{modelName}</span>
      </p>
      <div className={styles.slider}>
        <span className={styles.fill} aria-hidden="true" />
        {levels.map((level, stop) => (
          <span
            key={level}
            className={styles.stop}
            style={{ "--stop": stop / last } as CSSProperties}
            data-filled={stop / last <= ratio}
            aria-hidden="true"
          />
        ))}
        <span className={styles.thumb} aria-hidden="true" />
        <input
          ref={slider}
          className={styles.input}
          type="range"
          min={0}
          max={last}
          step={1}
          value={Math.round(ratio * last)}
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
    </div>
  );
}
