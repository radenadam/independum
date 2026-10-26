import type { ReactElement } from "react";
import { Mark } from "./mark.tsx";
import styles from "./top-bar.module.css";

/** Properties of the top bar. */
interface TopBarProps {
  location: string;
}

/** Draws the bar at the top of the screens that greet the user, with the current location. */
export function TopBar({ location }: TopBarProps): ReactElement {
  return (
    <header className={styles.bar}>
      <nav className={styles.location} aria-label="Location">
        <span className={styles.mark}>
          <Mark />
        </span>
        <span className={styles.name}>independum</span>
        <span className={styles.separator} aria-hidden="true">
          /
        </span>
        <span>{location}</span>
      </nav>
    </header>
  );
}
