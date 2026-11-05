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

// The body opens over this long, as the styles of the box set it, with a little to spare.
const openingMs = 260;

/** Properties of a step box. */
interface StepBoxProps {
  leading: ReactNode;
  label: string;
  status?: StepStatus | undefined;
  action?: ReactNode;
  isFollowing: boolean;
  isAsking?: boolean;
  shownAt?: number | undefined;
  openedAt?: number | undefined;
  hasBody: boolean;
  children: ReactNode;
}

// The box stays open while the step is under way and shows its latest lines, and folds once
// the step ends, unless the user opens or closes it. While it asks the user, such as for an
// approval, it shows every line, because the user answers what it shows. Asked to show itself, it
// opens and comes into view.
/**
 * Draws one step of the agent, such as thinking or a call to a tool, in a box set apart from
 * the reply.
 */
export function StepBox({
  leading,
  label,
  status,
  action,
  isFollowing,
  isAsking = false,
  shownAt,
  openedAt,
  hasBody,
  children,
}: StepBoxProps): ReactElement {
  const [choice, setChoice] = useState<boolean | undefined>();
  const [isClipped, setIsClipped] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const isOpen = hasBody && (choice ?? (isFollowing || isAsking));
  const header = (
    <>
      {leading}
      <OneLineTitle text={label} />
      {status === undefined ? null : <StatusLabel status={status} />}
    </>
  );

  // A step inside a folded group opens with the group, so it comes into view once both have opened.
  useEffect(() => {
    if (shownAt === undefined) {
      return;
    }
    setChoice(true);
    const isMoving = !prefersReducedMotion();
    const timer = window.setTimeout(
      () => {
        box.current?.scrollIntoView({ block: "center", behavior: isMoving ? "smooth" : "auto" });
        if (isMoving) {
          box.current?.animate(
            [{ boxShadow: "0 0 0 4px var(--signal-soft)" }, { boxShadow: "0 0 0 4px transparent" }],
            { duration: 1600, easing: "ease-in" },
          );
        }
      },
      isMoving ? openingMs : 0,
    );
    return () => window.clearTimeout(timer);
  }, [shownAt]);

  useEffect(() => {
    if (openedAt !== undefined) {
      setChoice(true);
    }
  }, [openedAt]);

  // The top of the latest lines fades only once they push the first ones out of view.
  useLayoutEffect(() => {
    const element = view.current;
    const content = element?.firstElementChild;
    if (element !== null && content instanceof HTMLElement) {
      setIsClipped(content.offsetHeight > element.clientHeight + 1);
    }
  });

  return (
    <div ref={box} className={styles.box} data-open={isOpen} data-copy="skip">
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
            <div
              ref={view}
              className={styles.view}
              data-following={choice === undefined && !isAsking}
              data-clipped={isClipped}
            >
              <div>{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
