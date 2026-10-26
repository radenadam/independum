import type { ReactElement, ReactNode } from "react";
import styles from "./sliding-column.module.css";

/** Properties of a sliding column. */
interface SlidingColumnProps {
  element: "nav" | "aside";
  label: string;
  edge: "start" | "end";
  isOpen: boolean;
  children: ReactNode;
}

/**
 * Draws a column at an edge of the working screen that slides open and closed, and covers the
 * chat on a phone.
 */
export function SlidingColumn({
  element: Element,
  label,
  edge,
  isOpen,
  children,
}: SlidingColumnProps): ReactElement {
  return (
    <Element
      className={`${styles.column} ${styles[edge]}`}
      aria-label={label}
      data-open={isOpen}
      inert={!isOpen}
    >
      <div className={styles.inner}>{children}</div>
    </Element>
  );
}
