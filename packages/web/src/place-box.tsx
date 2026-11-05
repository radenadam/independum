import type { ReactElement, ReactNode } from "react";
import styles from "./place-box.module.css";

/** Properties of a place box. */
interface PlaceBoxProps {
  children: ReactNode;
}

// Its rows are `PlaceRow`s that say they are boxed.
/**
 * Draws rows of a place that belong together in one box, with lines between them, like the
 * logins of the settings.
 */
export function PlaceBox({ children }: PlaceBoxProps): ReactElement {
  return <div className={styles.box}>{children}</div>;
}
