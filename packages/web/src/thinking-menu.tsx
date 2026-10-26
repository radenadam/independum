import type { ChatState } from "independum/api-types";
import { type CSSProperties, type PointerEvent, type ReactElement, useEffect, useRef } from "react";
import { describeThinking } from "./describe-thinking.ts";
import { hasKeyboard } from "./has-keyboard.ts";
import styles from "./thinking-menu.module.css";
import { thinkingRatio } from "./thinking-ratio.ts";

/** Properties of the thinking menu. */
interface ThinkingMenuProps {
  thinking: NonNullable<ChatState["thinking"]>;
  onChoose: (level: string) => void;
}

// The dial is the Effort icon drawn large: an arc of 240 degrees around a hub, open at the bottom,
// that starts at the lower left for the lowest level and ends at the lower right for the highest.
const center = { x: 100, y: 96 };
const sweep = 240;
const start = 210;

/**
 * Draws a dial over the thinking levels that the model offers, with a tick for each level and the
 * chosen one named under the hub, which a drag, a click, or the arrow keys turn.
 */
export function ThinkingMenu({ thinking, onChoose }: ThinkingMenuProps): ReactElement {
  const slider = useRef<HTMLInputElement>(null);
  const chosen = useRef(thinking.level);
  const { levels } = thinking;
  const last = Math.max(1, levels.length - 1);
  const ratio = thinkingRatio(thinking);
  const index = Math.round(ratio * last);

  useEffect(() => {
    if (hasKeyboard()) {
      slider.current?.focus();
    }
  }, []);

  // A drag passes over the same level many times before the chat reports the change, so a level is
  // chosen once until another one is.
  function choose(level: string | undefined): void {
    if (level !== undefined && level !== chosen.current) {
      chosen.current = level;
      onChoose(level);
    }
  }

  function chooseAt(event: PointerEvent<SVGSVGElement>): void {
    choose(levels[Math.round(ratioAt(event) * last)]);
  }

  return (
    <div className={styles.menu} style={{ "--ratio": ratio } as CSSProperties}>
      <svg
        className={styles.dial}
        viewBox="0 0 200 148"
        aria-hidden="true"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          slider.current?.focus({ preventScroll: true });
          chooseAt(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            chooseAt(event);
          }
        }}
      >
        <path className={styles.track} d={arc(70)} />
        <path className={styles.fill} d={arc(70)} pathLength={1} />
        {levels.map((level, stop) => (
          <path
            key={level}
            className={styles.tick}
            data-reached={stop <= index}
            d={`M${pointAt(stop / last, 84)}L${pointAt(stop / last, 92)}`}
          />
        ))}
        <path className={styles.needle} d={`M${center.x} ${center.y}V${center.y - 52}`} />
        <circle className={styles.hub} cx={center.x} cy={center.y} r={7} />
        <text className={styles.level} x={center.x} y={138} textAnchor="middle">
          {describeThinking(thinking.level)}
        </text>
      </svg>
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
        onChange={(event) => choose(levels[Number(event.target.value)])}
      />
    </div>
  );
}

// Returns the point at a ratio along the dial and a distance from the hub, as SVG coordinates.
function pointAt(ratio: number, radius: number): string {
  const angle = ((start - sweep * ratio) * Math.PI) / 180;
  const x = center.x + radius * Math.cos(angle);
  const y = center.y - radius * Math.sin(angle);
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

function arc(radius: number): string {
  return `M${pointAt(0, radius)}A${radius} ${radius} 0 1 1 ${pointAt(1, radius)}`;
}

// Returns how far along the dial a pointer sits. The open gap at the bottom goes to the nearer end.
function ratioAt(event: PointerEvent<SVGSVGElement>): number {
  const box = event.currentTarget.getBoundingClientRect();
  const scale = box.width / 200;
  const x = (event.clientX - box.left) / scale - center.x;
  const y = (event.clientY - box.top) / scale - center.y;
  const angle = (Math.atan2(-y, x) * 180) / Math.PI;
  const along = (((start - angle) % 360) + 360) % 360;
  if (along <= sweep) {
    return along / sweep;
  }
  return along < sweep + (360 - sweep) / 2 ? 1 : 0;
}
