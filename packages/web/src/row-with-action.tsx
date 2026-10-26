import type { ReactElement, ReactNode, Ref } from "react";
import styles from "./row-with-action.module.css";

/** Properties of a row with an action. */
interface RowWithActionProps {
  children: ReactNode;
  action: ReactNode;
  actionRef?: Ref<HTMLSpanElement>;
  isActionShown?: boolean;
}

/**
 * Draws a row with a small button over its end, which shows while the row is pointed at or focused,
 * and always on a touch screen.
 */
export function RowWithAction({
  children,
  action,
  actionRef,
  isActionShown = false,
}: RowWithActionProps): ReactElement {
  return (
    <div className={styles.row} data-action-shown={isActionShown}>
      {children}
      <span ref={actionRef} className={styles.action}>
        {action}
      </span>
    </div>
  );
}
