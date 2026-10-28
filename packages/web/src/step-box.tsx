import { type ReactElement, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./icon.tsx";
import { SlidingTitle } from "./sliding-title.tsx";
import styles from "./step-box.module.css";

/** What a step box says at its right: a quiet fact, something that needs attention, or a timer. */
export interface StepStatus {
  text: string;
  tone: "quiet" | "alert" | "running";
}

/** Properties of a step box. */
interface StepBoxProps {
  leading: ReactNode;
  label: string;
  status?: StepStatus | undefined;
  isFollowing: boolean;
  hasBody: boolean;
  children: ReactNode;
}

/**
 * Draws one step of the agent, such as thinking or a call to a tool, in a box set apart from the
 * reply. The box stays open while the step is under way and shows its latest lines, and folds once
 * the step ends, unless the user opens or closes it.
 */
export function StepBox({
  leading,
  label,
  status,
  isFollowing,
  hasBody,
  children,
}: StepBoxProps): ReactElement {
  const [choice, setChoice] = useState<boolean | undefined>();
  const [isClipped, setIsClipped] = useState(false);
  const view = useRef<HTMLDivElement>(null);
  const isOpen = hasBody && (choice ?? isFollowing);
  const header = (
    <>
      {leading}
      <SlidingTitle text={label} />
      {status === undefined ? null : (
        <span className={styles.status} data-tone={status.tone}>
          {status.text}
        </span>
      )}
    </>
  );

  // The top of the latest lines fades only once they push the first ones out of view.
  useLayoutEffect(() => {
    const element = view.current;
    const content = element?.firstElementChild;
    if (element !== null && content instanceof HTMLElement) {
      setIsClipped(content.offsetHeight > element.clientHeight + 1);
    }
  });

  return (
    <div
      className={styles.box}
      data-open={isOpen}
      data-following={choice === undefined}
      data-copy="skip"
    >
      {hasBody ? (
        <button
          type="button"
          className={styles.header}
          aria-expanded={isOpen}
          onClick={() => setChoice(!isOpen)}
        >
          {header}
          <span className={styles.chevron}>
            <Icon name="expand" size={15} />
          </span>
        </button>
      ) : (
        <p className={styles.header}>{header}</p>
      )}
      <div className={styles.body} inert={!isOpen}>
        <div className={styles.clip}>
          <div className={styles.content}>
            <div ref={view} className={styles.view} data-clipped={isClipped}>
              <div>{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
