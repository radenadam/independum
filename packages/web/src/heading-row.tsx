import type { ReactElement, ReactNode } from "react";
import styles from "./heading-row.module.css";

/** Properties of a heading row. */
interface HeadingRowProps {
  children: ReactNode;
}

/** Draws a heading with its command at the far end, both aligned on their text. */
export function HeadingRow({ children }: HeadingRowProps): ReactElement {
  return <div className={styles.row}>{children}</div>;
}
