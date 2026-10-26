import type { ChatState } from "independum/api-types";
import { type CSSProperties, type ReactElement, useEffect, useRef } from "react";
import { describeThinking } from "./describe-thinking.ts";
import { hasKeyboard } from "./has-keyboard.ts";
import styles from "./thinking-menu.module.css";
import { thinkingRatio } from "./thinking-ratio.ts";

/** Properties of the thinking menu. */
interface ThinkingMenuProps {
  thinking: NonNullable<ChatState["thinking"]>;
  onChoose: (level: string) => void;
}

/**
 * Draws the chosen thinking level over an upright bar with a stop for each level that the model
 * offers, which a drag, a click, or the arrow keys move.
 */
export function ThinkingMenu({ thinking, onChoose }: ThinkingMenuProps): ReactElement {
  const slider = useRef<HTMLInputElement>(null);
  const { levels } = thinking;
  const last = Math.max(1, levels.length - 1);
  const ratio = thinkingRatio(thinking);
  const index = Math.round(ratio * last);

  useEffect(() => {
    if (hasKeyboard()) {
      slider.current?.focus();
    }
  }, []);

  return (
    <div
      className={styles.menu}
      style={{ "--ratio": ratio, "--count": levels.length } as CSSProperties}
    >
      <p className={styles.level}>{describeThinking(thinking.level)}</p>
      <div className={styles.bar}>
        <span className={styles.rail} aria-hidden="true" />
        <span className={styles.fill} aria-hidden="true" />
        {levels.map((level, stop) => (
          <span
            key={level}
            className={styles.stop}
            style={{ "--stop": stop / last } as CSSProperties}
            data-reached={stop <= index}
            aria-hidden="true"
          />
        ))}
        <span className={styles.knob} aria-hidden="true" />
        <input
          ref={slider}
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
    </div>
  );
}
