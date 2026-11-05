import type { ReactElement, ReactNode } from "react";
import styles from "./place-box.module.css";

/** Properties of a place box. */
interface PlaceBoxProps {
  children: ReactNode;
}

/**
 * Draws rows of a place that belong together in one box, with lines between them, like the logins
 * of the settings. Its rows are `PlaceRow`s that say they are boxed.
 */
export function PlaceBox({ children }: PlaceBoxProps): ReactElement {
  return <div className={styles.box}>{children}</div>;
}
