import type { ReactElement, ReactNode } from "react";
import styles from "./boxed-list.module.css";
import { Icon } from "./icon.tsx";
import { OneLineTitle } from "./one-line-title.tsx";
import { useTooltip } from "./use-tooltip.tsx";

/**
 * One entry of a boxed list, with an optional logo before its name, its controls after it, and
 * details that it opens.
 */
interface BoxedEntry {
  key: string;
  name: string;
  detail: string;
  tooltip?: string;
  leading?: ReactNode;
  trailing: ReactNode;
  onOpen?: () => void;
}

/** Properties of a boxed list. */
interface BoxedListProps {
  entries: BoxedEntry[];
  hasLongNames?: boolean;
}

// Long names, such as chat titles, push the controls below them when the box is narrow.
/** Draws entries in a bordered box, one to a row, with lines between them. */
export function BoxedList({ entries, hasLongNames = false }: BoxedListProps): ReactElement {
  return (
    <ul className={styles.list} data-long-names={hasLongNames}>
      {entries.map((entry) => (
        <BoxedRow key={entry.key} entry={entry} />
      ))}
    </ul>
  );
}

// An entry that opens its details is one button up to its controls, with the chevron that a tile
// shows, so it reads as something that opens.
function BoxedRow({ entry }: { entry: BoxedEntry }): ReactElement {
  const tip = useTooltip(entry.tooltip);
  return (
    <li className={styles.entry} data-opens={entry.onOpen !== undefined}>
      {entry.leading}
      {entry.onOpen === undefined ? (
        <span className={styles.text} {...tip.handlers}>
          <span className={styles.name}>{entry.name}</span>
          <span className={styles.detail}>{entry.detail}</span>
          {tip.tooltip}
        </span>
      ) : (
        <button type="button" className={styles.open} onClick={entry.onOpen}>
          <span className={styles.text}>
            <span className={styles.title}>
              <OneLineTitle text={entry.name} />
            </span>
            <span className={styles.detail}>{entry.detail}</span>
          </span>
          <Icon name="expand" size={14} />
        </button>
      )}
      <span className={styles.trailing}>{entry.trailing}</span>
    </li>
  );
}
