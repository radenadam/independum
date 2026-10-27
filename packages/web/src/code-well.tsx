import type { ReactElement } from "react";
import styles from "./code-well.module.css";
import { CopyButton } from "./copy-button.tsx";

/** Properties of a code well. */
interface CodeWellProps {
  code: string;
  copyLabel: string;
}

/** Draws code in a well that scrolls when it is long, with a button in its corner that copies it. */
export function CodeWell({ code, copyLabel }: CodeWellProps): ReactElement {
  return (
    <div className={styles.well}>
      <div className={styles.copy}>
        <CopyButton text={code} label={copyLabel} tipAlign="end" />
      </div>
      <pre className={styles.code}>{code}</pre>
    </div>
  );
}
