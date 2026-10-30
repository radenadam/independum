import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "./icon.tsx";
import { OneLineTitle } from "./one-line-title.tsx";
import { prefersReducedMotion } from "./prefers-reduced-motion.ts";
import { StatusLabel, type StepStatus } from "./status-label.tsx";
import styles from "./step-box.module.css";

/** Properties of a step box. */
interface StepBoxProps {
  leading: ReactNode;
  label: string;
  status?: StepStatus | undefined;
  action?: ReactNode;
  isFollowing: boolean;
  shownAt?: number | undefined;
  hasBody: boolean;
  children: ReactNode;
}

/**
 * Draws one step of the agent, such as thinking or a call to a tool, in a box set apart from the
 * reply. The box stays open while the step is under way and shows its latest lines, and folds once
 * the step ends, unless the user opens or closes it. Asked to show itself, it opens and comes into
 * view.
 */
export function StepBox({
  leading,
  label,
  status,
  action,
  isFollowing,
  shownAt,
  hasBody,
  children,
}: StepBoxProps): ReactElement {
  const [choice, setChoice] = useState<boolean | undefined>();
  const [isClipped, setIsClipped] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const isOpen = hasBody && (choice ?? isFollowing);
  const header = (
    <>
      {leading}
      <OneLineTitle text={label} />
      {status === undefined ? null : <StatusLabel status={status} />}
    </>
  );

  useEffect(() => {
    if (shownAt === undefined) {
      return;
    }
    setChoice(true);
    const isMoving = !prefersReducedMotion();
    box.current?.scrollIntoView({ block: "center", behavior: isMoving ? "smooth" : "auto" });
    if (isMoving) {
      box.current?.animate(
        [{ boxShadow: "0 0 0 4px var(--signal-soft)" }, { boxShadow: "0 0 0 4px transparent" }],
        { duration: 1600, easing: "ease-in" },
      );
    }
  }, [shownAt]);

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
      ref={box}
      className={styles.box}
      data-open={isOpen}
      data-following={choice === undefined}
      data-copy="skip"
    >
      <div className={styles.top}>
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
        {action === undefined ? null : <span className={styles.action}>{action}</span>}
      </div>
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
