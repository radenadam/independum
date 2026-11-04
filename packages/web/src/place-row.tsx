import type { ReactElement } from "react";
import { Badge, type BadgeProps } from "./badge.tsx";
import { Icon } from "./icon.tsx";
import { OneLineTitle } from "./one-line-title.tsx";
import styles from "./place-row.module.css";

/** Properties of a place row. */
interface PlaceRowProps {
  label: string;
  // A null number keeps its place empty, so the row lines up with the numbered rows of its list.
  number?: number | null | undefined;
  glance?: string;
  badge?: BadgeProps | undefined;
  amount?: string;
  isCurrent?: boolean;
  isLit?: boolean;
  onOpen: () => void;
  onPoint?: (isPointed: boolean) => void;
}

/**
 * Draws one row of a place as a tile that opens what it names, with its number before it, its
 * glance under its name, and its badge, its amount, and a chevron after it, so a glance tells what
 * is there and that more is inside.
 */
export function PlaceRow({
  label,
  number,
  glance,
  badge,
  amount,
  isCurrent = false,
  isLit = false,
  onOpen,
  onPoint,
}: PlaceRowProps): ReactElement {
  return (
    <button
      type="button"
      className={styles.row}
      aria-current={isCurrent ? "true" : undefined}
      data-lit={isLit}
      onClick={onOpen}
      onPointerEnter={() => onPoint?.(true)}
      onPointerLeave={() => onPoint?.(false)}
    >
      {number === undefined ? null : <span className={styles.number}>{number}</span>}
      <span className={styles.text}>
        <OneLineTitle text={label} />
        {glance === undefined || glance === "" ? null : (
          <span className={styles.glance}>
            <OneLineTitle text={glance} />
          </span>
        )}
      </span>
      {badge === undefined ? null : <Badge {...badge} />}
      {amount === undefined ? null : <span className={styles.amount}>{amount}</span>}
      <Icon name="expand" size={14} />
    </button>
  );
}
