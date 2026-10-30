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
  const [pointed, setPointed] = useState<number | undefined>();
  const [isOnKnob, setIsOnKnob] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  // The knob keeps the level it was let go on until the chat reports that level, so it never jumps
  // back while the choice is on its way.
  if (held !== undefined && held === thinking.level) {
    setHeld(undefined);
  }
  const level = held ?? thinking.level;
  const index = Math.max(0, thinking.levels.indexOf(level));
  const last = Math.max(1, thinking.levels.length - 1);
  const ratio = index / last;

  // The stop nearest the mouse is the one it points at, and the mouse is on the knob while it is
  // within its width, both measured on the drawing itself.
  function point(x: number): void {
    const knob = bar.current?.querySelector(`.${styles.knob}`)?.getBoundingClientRect();
    setIsOnKnob(knob !== undefined && x >= knob.left && x <= knob.right);
    const stops = [...(bar.current?.querySelectorAll(`.${styles.stop}`) ?? [])];
    const distances = stops.map((stop) => {
      const box = stop.getBoundingClientRect();
      return Math.abs(box.left + box.width / 2 - x);
    });
    setPointed(distances.indexOf(Math.min(...distances)));
  }

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
      <div ref={bar} className={styles.bar} style={{ "--ratio": ratio } as CSSProperties}>
        <span className={styles.fill} />
        {thinking.levels.map((stop, at) => (
          <span
            key={stop}
            className={styles.stop}
            data-reached={at <= index}
            data-pointed={at === pointed}
            style={{ "--at": at / last } as CSSProperties}
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
          onPointerMove={(event) => {
            if (event.pointerType === "mouse") {
              point(event.clientX);
            }
          }}
          onPointerLeave={() => {
            setPointed(undefined);
            setIsOnKnob(false);
          }}
        />
        <span className={styles.knob} data-pointed={isOnKnob} />
        {pointed === undefined ? null : (
          <span className={styles.peek} style={{ "--at": pointed / last } as CSSProperties}>
            {describeThinking(thinking.levels[pointed] ?? level)}
          </span>
        )}
      </div>
    </div>
  );
}
