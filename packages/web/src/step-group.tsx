import type { ReactElement, ReactNode } from "react";
import { Icon } from "./icon.tsx";
import { StepBox } from "./step-box.tsx";
import styles from "./step-group.module.css";

/** Properties of a group of steps. */
interface StepGroupProps {
  count: number;
  isFollowing: boolean;
  children: ReactNode;
}

/**
 * Draws the steps and thoughts between two texts as one box, which shows the latest of them while they run
 * and folds them into one line once they are done, so a long run of work does not crowd the reply.
 */
export function StepGroup({ count, isFollowing, children }: StepGroupProps): ReactElement {
  return (
    <StepBox
      leading={<Icon name="steps" size={16} />}
      label={`${count} ${count === 1 ? "step" : "steps"}`}
      isFollowing={isFollowing}
      hasBody
    >
      <div className={styles.steps}>{children}</div>
    </StepBox>
  );
}
