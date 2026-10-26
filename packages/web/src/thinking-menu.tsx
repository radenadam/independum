import type { ChatState } from "independum/api-types";
import {
  type CSSProperties,
  type PointerEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
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
 * offers, which a drag, a click, or the arrow keys move. Pointing at a stop names its level.
 */
export function ThinkingMenu({ thinking, onChoose }: ThinkingMenuProps): ReactElement {
  const slider = useRef<HTMLInputElement>(null);
  const [pointed, setPointed] = useState<number | undefined>();
  const { levels } = thinking;
  const last = Math.max(1, levels.length - 1);
  const ratio = thinkingRatio(thinking);
  const index = Math.round(ratio * last);
  const isPreview = pointed !== undefined && pointed !== index;
  const shown = isPreview ? (levels[pointed] ?? thinking.level) : thinking.level;

  useEffect(() => {
    if (hasKeyboard()) {
      slider.current?.focus();
    }
  }, []);

  // The stop nearest the pointer is the one it points at, measured on the stops as drawn.
  function point(event: PointerEvent<HTMLInputElement>): void {
    const stops = [...(event.currentTarget.parentElement?.querySelectorAll("[data-stop]") ?? [])];
    const distances = stops.map((stop) => {
      const box = stop.getBoundingClientRect();
      return Math.abs(box.top + box.height / 2 - event.clientY);
    });
    setPointed(distances.indexOf(Math.min(...distances)));
  }

  return (
    <div
      className={styles.menu}
      style={{ "--ratio": ratio, "--count": levels.length } as CSSProperties}
    >
      <p className={styles.level} data-preview={isPreview}>
        {describeThinking(shown)}
      </p>
      <div className={styles.bar}>
        <span className={styles.rail} aria-hidden="true" />
        <span className={styles.fill} aria-hidden="true" />
        {levels.map((level, stop) => (
          <span
            key={level}
            className={styles.stop}
            style={{ "--stop": stop / last } as CSSProperties}
            data-stop={stop}
            data-reached={stop <= index}
            data-pointed={isPreview && stop === pointed}
            aria-hidden="true"
          />
        ))}
        <span className={styles.knob} data-pointed={pointed === index} aria-hidden="true" />
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
          onPointerMove={point}
          onPointerLeave={() => setPointed(undefined)}
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
