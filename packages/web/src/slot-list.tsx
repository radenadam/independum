import type { ReactElement } from "react";
import styles from "./slot-list.module.css";

/** Properties of a slot list. */
interface SlotListProps {
  slots: { name: string; meaning: string }[];
  onInsert?: (name: string) => void;
}

/**
 * Draws the slots of a text, each with what it holds. A slot of a text that the user edits is a
 * button that puts it into the text.
 */
export function SlotList({ slots, onInsert }: SlotListProps): ReactElement {
  return (
    <ul className={styles.slots} aria-label="Slots">
      {slots.map((slot) => (
        <li key={slot.name} className={styles.slot}>
          {onInsert === undefined ? (
            <code className={styles.name}>{`{${slot.name}}`}</code>
          ) : (
            <button
              type="button"
              className={styles.insert}
              aria-label={`Insert {${slot.name}}`}
              onClick={() => onInsert(slot.name)}
            >
              {`{${slot.name}}`}
            </button>
          )}
          <span>{slot.meaning}</span>
        </li>
      ))}
    </ul>
  );
}
