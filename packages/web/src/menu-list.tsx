import type { ReactElement } from "react";
import { Icon } from "./icon.tsx";
import styles from "./menu-list.module.css";

/** One choice in a menu list, with its name and a detail in a smaller monospace font. */
interface MenuChoice {
  key: string;
  name: string;
  detail: string;
  isCurrent: boolean;
  onChoose: () => void;
}

/** A group of choices under a heading. */
export interface MenuGroup {
  key: string;
  heading: string;
  choices: MenuChoice[];
}

/** Properties of a menu list. */
interface MenuListProps {
  groups: MenuGroup[];
  layout: "row" | "stacked";
  emptyNote: string;
}

/** Draws the choices of a pop-up in groups, with the current choice checked. */
export function MenuList({ groups, layout, emptyNote }: MenuListProps): ReactElement {
  return (
    <div className={styles.list}>
      {groups.map((group) => (
        <div key={group.key}>
          <h2 className={styles.heading}>{group.heading}</h2>
          {group.choices.map((choice) => (
            <button
              key={choice.key}
              type="button"
              className={`${styles.choice} ${styles[layout]}`}
              aria-current={choice.isCurrent ? "true" : undefined}
              onClick={choice.onChoose}
            >
              <span className={styles.text}>
                <span className={styles.name}>{choice.name}</span>
                <span className={styles.detail}>{choice.detail}</span>
              </span>
              <span className={styles.check}>
                {choice.isCurrent ? <Icon name="check" size={16} /> : null}
              </span>
            </button>
          ))}
        </div>
      ))}
      {groups.length === 0 ? <p className={styles.note}>{emptyNote}</p> : null}
    </div>
  );
}
