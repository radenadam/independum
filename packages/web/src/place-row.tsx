import type { ReactElement } from "react";
import { Icon } from "./icon.tsx";
import { OneLineTitle } from "./one-line-title.tsx";
import styles from "./place-row.module.css";

/** Properties of a place row. */
interface PlaceRowProps {
  label: string;
  source?: string;
  glance?: string;
  tag?: string | undefined;
  isTagMarked?: boolean;
  amount?: string;
  isCurrent?: boolean;
  isLit?: boolean;
  onOpen: () => void;
  onPoint?: (isPointed: boolean) => void;
}

/**
 * Draws one row of a place that opens what it names, with who it comes from and its glance under
 * its name, and its tag, its amount, and a chevron after it, so a glance tells what is there and
 * that more is inside.
 */
export function PlaceRow({
  label,
  source,
  glance,
  tag,
  isTagMarked = false,
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
      <span className={styles.text}>
        <OneLineTitle text={label} />
        {source === undefined && glance === undefined ? null : (
          <span className={styles.glance}>{[source, glance].filter(Boolean).join(", ")}</span>
        )}
      </span>
      {tag === undefined ? null : (
        <span className={styles.tag} data-marked={isTagMarked}>
          {tag}
        </span>
      )}
      {amount === undefined ? null : <span className={styles.amount}>{amount}</span>}
      <Icon name="expand" size={14} />
    </button>
  );
}
