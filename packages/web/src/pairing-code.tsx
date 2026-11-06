import type { ReactElement } from "react";
import styles from "./pairing-code.module.css";

/** Draws the public comparison code shared by both ends of a pairing attempt. */
export function PairingCode({ code }: { code: string }): ReactElement {
  return (
    <output className={styles.code} aria-label="Comparison code">
      {code}
    </output>
  );
}
