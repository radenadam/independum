import { type KeyboardEvent, type ReactElement, useEffect, useRef } from "react";
import styles from "./action-menu.module.css";
import { hasKeyboard } from "./has-keyboard.ts";
import { Icon, type IconName } from "./icon.tsx";
import { RowButton } from "./row-button.tsx";

/** One action of a menu, with its icon. */
interface MenuAction {
  icon: IconName;
  label: string;
  onSelect: () => void;
}

/** Properties of an action menu. */
interface ActionMenuProps {
  label: string;
  groups: MenuAction[][];
}

/** Draws the actions of a menu in groups divided by lines, which the arrow keys move between. */
export function ActionMenu({ label, groups }: ActionMenuProps): ReactElement {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasKeyboard()) {
      menu.current?.querySelector("button")?.focus();
    }
  }, []);

  function moveFocus(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    const buttons = [...(menu.current?.querySelectorAll("button") ?? [])];
    if (step === 0 || buttons.length === 0) {
      return;
    }
    event.preventDefault();
    const focused = document.activeElement;
    const index = focused instanceof HTMLButtonElement ? buttons.indexOf(focused) : -1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  }

  return (
    <div ref={menu} className={styles.menu} role="menu" aria-label={label} onKeyDown={moveFocus}>
      {groups.map((group) => (
        <div key={group[0]?.label} className={styles.group}>
          {group.map((action) => (
            <RowButton
              key={action.label}
              label={action.label}
              leading={<Icon name={action.icon} size={16} />}
              role="menuitem"
              onClick={action.onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
