import type { ChatState } from "independum/api-types";
import { type CSSProperties, type ReactElement, useEffect, useRef, useState } from "react";
import { describeThinking } from "./describe-thinking.ts";
import styles from "./effort-slider.module.css";
import { InfoTip } from "./info-tip.tsx";

/** Properties of an effort slider. */
interface EffortSliderProps {
  thinking: NonNullable<ChatState["thinking"]>;
  onChoose: (level: string) => void;
}

/**
 * Draws the thinking effort of the model as a wide bar with a stop for each level and a knob. The
 * knob moves freely while it is dragged, and its level is chosen only once it is let go, so the rest
 * of the screen stays still while it moves.
 */
export function EffortSlider({ thinking, onChoose }: EffortSliderProps): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [held, setHeld] = useState<string | undefined>();
  // The knob keeps the level it was let go on until the chat reports that level, so it never jumps
  // back while the choice is on its way.
  if (held !== undefined && held === thinking.level) {
    setHeld(undefined);
  }
  const level = held ?? thinking.level;
  const index = Math.max(0, thinking.levels.indexOf(level));
  const ratio = index / Math.max(1, thinking.levels.length - 1);

  // The change event of a range fires once the knob is let go, while React reports every move.
  useEffect(() => {
    const element = input.current;
    if (element === null) {
      return;
    }
    function choose(): void {
      const chosen = thinking.levels[Number(element?.value)];
      if (chosen !== undefined && chosen !== thinking.level) {
        onChoose(chosen);
      }
    }
    element.addEventListener("change", choose);
    return () => element.removeEventListener("change", choose);
  }, [thinking, onChoose]);

  return (
    <div className={styles.effort}>
      <div className={styles.top}>
        <span>Thinking effort</span>
        <InfoTip text="How much the model thinks before it answers. More effort takes longer and uses more tokens." />
        <span className={styles.level}>{describeThinking(level)}</span>
      </div>
      <div className={styles.bar} style={{ "--ratio": ratio } as CSSProperties}>
        <span className={styles.fill} />
        {thinking.levels.map((stop, at) => (
          <span
            key={stop}
            className={styles.stop}
            data-reached={at <= index}
            style={{ "--at": at / Math.max(1, thinking.levels.length - 1) } as CSSProperties}
          />
        ))}
        <input
          ref={input}
          type="range"
          className={styles.slider}
          min={0}
          max={Math.max(0, thinking.levels.length - 1)}
          step={1}
          value={index}
          aria-label="Thinking effort"
          aria-valuetext={describeThinking(level)}
          onChange={(event) => setHeld(thinking.levels[Number(event.target.value)])}
        />
        <span className={styles.knob} />
      </div>
    </div>
  );
}
