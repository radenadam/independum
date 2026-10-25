import type { ReactElement, ReactNode } from "react";
import styles from "./heading-row.module.css";

/** Properties of a heading row. */
interface HeadingRowProps {
  heading: ReactNode;
  command?: ReactNode;
}

/** Draws a heading with its command at the far end, both aligned on their text. */
export function HeadingRow({ heading, command }: HeadingRowProps): ReactElement {
  // A command button aligns itself to the top of a flex row, so its own block keeps it on the
  // heading's line of text.
  return (
    <div className={styles.row}>
      {heading}
      <div>{command}</div>
    </div>
  );
}
