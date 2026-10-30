import type { ReactElement } from "react";
import { Icon } from "./icon.tsx";
import styles from "./info-tip.module.css";
import { useTooltip } from "./use-tooltip.tsx";

/** Properties of an info tip. */
interface InfoTipProps {
  text: string;
}

/**
 * Draws an i in a circle that explains the thing beside it in a tooltip, while a mouse rests on it,
 * while the keyboard focuses it, or from one tap of a finger to the next.
 */
export function InfoTip({ text }: InfoTipProps): ReactElement {
  const tip = useTooltip(text);
  const { onPointerEnter, onPointerLeave, onFocus, onBlur } = tip.handlers;
  return (
    <button
      type="button"
      className={styles.info}
      aria-label={text}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerUp={(event) => {
        if (event.pointerType !== "mouse") {
          tip.toggle(event.currentTarget);
        }
      }}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <Icon name="info" size={15} />
      {tip.tooltip}
    </button>
  );
}
