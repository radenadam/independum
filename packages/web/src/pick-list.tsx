import type { ReactElement } from "react";
import styles from "./pick-list.module.css";

/** One entry of a pick list, with its name on the left and an optional short detail on the right. */
interface PickListEntry {
  id: string;
  name: string;
  detail?: string;
  isDetailMarked?: boolean;
}

/** Properties of a pick list. */
interface PickListProps {
  entries: PickListEntry[];
  pickedId: string | undefined;
  onPick: (id: string) => void;
  isCompact?: boolean;
}

/**
 * Draws a numbered list of entries joined to their details by dotted leaders, with each name on
 * one line when the list is compact.
 */
export function PickList({
  entries,
  pickedId,
  onPick,
  isCompact = false,
}: PickListProps): ReactElement {
  return (
    <ol className={styles.entries}>
      {entries.map((entry, index) => (
        <li key={entry.id}>
          <button
            type="button"
            className={isCompact ? `${styles.entry} ${styles.compact}` : styles.entry}
            aria-pressed={entry.id === pickedId}
            title={isCompact ? entry.name : undefined}
            onClick={() => onPick(entry.id)}
          >
            <span className={styles.marker}>
              {entry.id === pickedId ? ">" : String(index + 1).padStart(2, "0")}
            </span>
            <span className={isCompact ? styles.compactName : styles.name}>{entry.name}</span>
            {entry.detail === undefined ? null : (
              <>
                <span className={styles.leader} aria-hidden="true" />
                <span
                  className={entry.isDetailMarked === true ? styles.markedDetail : styles.detail}
                >
                  {entry.detail}
                </span>
              </>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}
