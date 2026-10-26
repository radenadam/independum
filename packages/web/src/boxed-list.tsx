import type { ReactElement, ReactNode } from "react";
import styles from "./boxed-list.module.css";

/** One entry of a boxed list, with an optional logo before its name and its controls after it. */
interface BoxedEntry {
  key: string;
  name: string;
  detail: string;
  title?: string;
  leading?: ReactNode;
  trailing: ReactNode;
}

/** Properties of a boxed list. */
interface BoxedListProps {
  entries: BoxedEntry[];
  hasLongNames?: boolean;
}

/**
 * Draws entries in a bordered box, one to a row, with lines between them. Long names, such as chat
 * titles, push the controls below them when the box is narrow.
 */
export function BoxedList({ entries, hasLongNames = false }: BoxedListProps): ReactElement {
  return (
    <ul className={styles.list} data-long-names={hasLongNames}>
      {entries.map((entry) => (
        <li key={entry.key} className={styles.entry}>
          {entry.leading}
          <span className={styles.text} title={entry.title}>
            <span className={styles.name}>{entry.name}</span>
            <span className={styles.detail}>{entry.detail}</span>
          </span>
          <span className={styles.trailing}>{entry.trailing}</span>
        </li>
      ))}
    </ul>
  );
}
