import type { ReactElement } from "react";
import styles from "./code-well.module.css";
import { CopyButton } from "./copy-button.tsx";

/** Properties of a code well. */
interface CodeWellProps {
  code: string;
  copyLabel: string;
  isWhole?: boolean;
}

/**
 * Draws code in a well with a button in its corner that copies it. A long code scrolls in the well,
 * or, when the well shows it whole, the place around it scrolls.
 */
export function CodeWell({ code, copyLabel, isWhole = false }: CodeWellProps): ReactElement {
  return (
    <div className={styles.well}>
      <div className={styles.copy}>
        <CopyButton text={code} label={copyLabel} tipAlign="end" />
      </div>
      <pre className={styles.code} data-whole={isWhole}>
        {code}
      </pre>
    </div>
  );
}
