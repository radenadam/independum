import type { ReactElement } from "react";
import styles from "./status-label.module.css";

/** How a step is going: a quiet fact, something that needs attention, or a timer while it runs. */
export interface StepStatus {
  text: string;
  tone: "quiet" | "alert" | "running";
}

/** Properties of a status label. */
interface StatusLabelProps {
  status: StepStatus;
}

/**
 * Draws how a step is going in small type, orange when it needs attention, and with a breathing
 * dot while it runs.
 */
export function StatusLabel({ status }: StatusLabelProps): ReactElement {
  return (
    <span className={styles.status} data-tone={status.tone}>
      {status.text}
    </span>
  );
}
