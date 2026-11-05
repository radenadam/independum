import type { ReactElement, ReactNode } from "react";
import { Badge, type BadgeProps } from "./badge.tsx";
import { Icon } from "./icon.tsx";
import { OneLineTitle } from "./one-line-title.tsx";
import styles from "./place-row.module.css";
import { StatusLabel, type StepStatus } from "./status-label.tsx";

/** Properties of a place row. */
interface PlaceRowProps {
  label: string;
  // A null number keeps its place empty, so the row lines up with the numbered rows of its list.
  number?: number | null | undefined;
  icon?: ReactNode;
  glance?: string | undefined;
  isGlanceCode?: boolean;
  status?: StepStatus | undefined;
  badge?: BadgeProps | undefined;
  amount?: string;
  isCurrent?: boolean;
  isLit?: boolean;
  // A row in a `PlaceBox` lies flat on it, with a line between it and the row above.
  isBoxed?: boolean;
  // A faded row names something that the model no longer reads as it was, such as a summarized request.
  isFaded?: boolean;
  onOpen: () => void;
  onPoint?: (isPointed: boolean) => void;
}

/**
 * Draws one row of a place as a tile that opens what it names, with its number or its icon before
 * it, its glance under its name, and its status, its badge, its amount, and a chevron after it, so
 * a glance tells what is there and that more is inside.
 */
export function PlaceRow({
  label,
  number,
  icon,
  glance,
  isGlanceCode = false,
  status,
  badge,
  amount,
  isCurrent = false,
  isLit = false,
  isBoxed = false,
  isFaded = false,
  onOpen,
  onPoint,
}: PlaceRowProps): ReactElement {
  return (
    <button
      type="button"
      className={styles.row}
      aria-current={isCurrent ? "true" : undefined}
      data-lit={isLit}
      data-boxed={isBoxed}
      data-faded={isFaded}
      onClick={onOpen}
      onPointerEnter={() => onPoint?.(true)}
      onPointerLeave={() => onPoint?.(false)}
    >
      {number === undefined ? null : <span className={styles.number}>{number}</span>}
      {icon === undefined ? null : <span className={styles.icon}>{icon}</span>}
      <span className={styles.text}>
        <OneLineTitle text={label} />
        {glance === undefined || glance === "" ? null : (
          <span className={styles.glance} data-code={isGlanceCode}>
            <OneLineTitle text={glance} />
          </span>
        )}
      </span>
      {status === undefined ? null : <StatusLabel status={status} />}
      {badge === undefined ? null : <Badge {...badge} />}
      {amount === undefined ? null : <span className={styles.amount}>{amount}</span>}
      <Icon name="expand" size={14} />
    </button>
  );
}
