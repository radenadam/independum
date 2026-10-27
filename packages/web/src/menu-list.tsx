import { type ReactElement, type ReactNode, useEffect, useRef } from "react";
import { hasKeyboard } from "./has-keyboard.ts";
import { Icon } from "./icon.tsx";
import styles from "./menu-list.module.css";
import { SlidingTitle } from "./sliding-title.tsx";

/** One choice in a menu list, with its name and an optional detail in a smaller monospace font. */
interface MenuChoice {
  key: string;
  name: string;
  detail?: string;
  logo?: ReactNode;
  isCurrent: boolean;
  onChoose: () => void;
}

/** A group of choices, under a heading when the menu has more than one kind of choice. */
export interface MenuGroup {
  key: string;
  heading?: string;
  logo?: ReactNode;
  choices: MenuChoice[];
}

/** Properties of a menu list. */
interface MenuListProps {
  groups: MenuGroup[];
  layout: "row" | "stacked";
  emptyNote: string;
}

/**
 * Draws the choices of a pop-up in groups, with the current choice checked. A name or a detail too
 * long for its row slides into view while the row is hovered.
 */
export function MenuList({ groups, layout, emptyNote }: MenuListProps): ReactElement {
  const list = useRef<HTMLDivElement>(null);

  // The current choice comes into view when the menu opens, even far down a long list. Opened from
  // the keyboard, it also takes the focus, unless a field of the menu took it first.
  useEffect(() => {
    const current = list.current?.querySelector<HTMLElement>("[aria-current]");
    current?.scrollIntoView({ block: "nearest" });
    const menu = list.current?.closest("[role=dialog]");
    if (hasKeyboard() && menu?.contains(document.activeElement) !== true) {
      current?.focus();
    }
  }, []);

  return (
    <div ref={list} className={styles.list}>
      {groups.map((group) => (
        <div key={group.key}>
          {group.heading === undefined ? null : (
            <h2 className={styles.heading}>
              {group.logo}
              {group.heading}
            </h2>
          )}
          {group.choices.map((choice) => (
            <button
              key={choice.key}
              type="button"
              className={`${styles.choice} ${styles[layout]}`}
              aria-current={choice.isCurrent ? "true" : undefined}
              onClick={choice.onChoose}
            >
              {choice.logo}
              <span className={styles.text}>
                <span className={styles.name}>
                  <SlidingTitle text={choice.name} />
                </span>
                {choice.detail === undefined ? null : (
                  <span className={styles.detail}>
                    <SlidingTitle text={choice.detail} align={layout === "row" ? "end" : "start"} />
                  </span>
                )}
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
