import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styles from "./popover.module.css";

/** Where a pop-up opens: above or below its button, or at a point of the screen. */
type PopoverPlace = "above" | "below" | { x: number; y: number };

/** Properties of a pop-up. */
interface PopoverProps {
  label: string;
  place: PopoverPlace;
  onClose: () => void;
  children: ReactNode;
  note?: string;
  size?: "regular" | "narrow";
}

// A pop-up keeps this far from the edges of the screen.
const edgeGap = 8;

/**
 * Draws a pop-up centered above or below its button, or at a point, with an optional note at its
 * foot, which closes on Escape or on a click anywhere outside it.
 */
export function Popover({
  label,
  place,
  onClose,
  children,
  note,
  size = "regular",
}: PopoverProps): ReactElement {
  const popover = useRef<HTMLDivElement>(null);
  const point = typeof place === "string" ? undefined : place;
  const [variables, setVariables] = useState<CSSProperties | undefined>();

  // A pop-up keeps its opening position while its button changes, such as when an effort label
  // changes width. Sizes come from the offset sizes, which the opening animation does not scale.
  useLayoutEffect(() => {
    const element = popover.current;
    if (element === null) {
      return;
    }
    if (point === undefined) {
      const button = element.parentElement?.getBoundingClientRect();
      if (button === undefined) {
        return;
      }
      const isAbove = place === "above";
      const room = isAbove ? button.top - 8 : window.innerHeight - button.bottom - 6;
      setVariables({
        "--left": `${leftInColumn(element, button)}px`,
        "--top": `${button.bottom + 6}px`,
        "--bottom": `${window.innerHeight - button.top + 8}px`,
        "--room": `${room - edgeGap}px`,
      } as CSSProperties);
      return;
    }
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const x =
      point.x + width > window.innerWidth - edgeGap ? Math.max(edgeGap, point.x - width) : point.x;
    const y =
      point.y + height > window.innerHeight - edgeGap
        ? Math.max(edgeGap, point.y - height)
        : point.y;
    setVariables({ "--x": `${x}px`, "--y": `${y}px` } as CSSProperties);
  }, [point, place]);

  // A pop-up that holds no control of its own, such as the details of a pending message, takes
  // the focus itself, so Escape reaches it. Its controls focus themselves first.
  useEffect(() => {
    const element = popover.current;
    if (element !== null && !element.contains(document.activeElement)) {
      element.focus();
    }
  }, []);

  const placeClass = typeof place === "string" ? styles[place] : styles.atPoint;

  return (
    <>
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close the menu"
        tabIndex={-1}
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={popover}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        className={`${styles.popover} ${placeClass} ${styles[size]}`}
        style={variables}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        {children}
        {note === undefined ? null : <p className={styles.note}>{note}</p>}
      </div>
    </>
  );
}

// Returns the left edge of a pop-up centered on its button and kept inside its column.
function leftInColumn(element: HTMLElement, button: DOMRect): number {
  const column = (
    element.closest("main, aside, nav") ?? document.documentElement
  ).getBoundingClientRect();
  const left = button.left + button.width / 2 - element.offsetWidth / 2;
  return Math.max(
    column.left + edgeGap,
    Math.min(left, column.right - edgeGap - element.offsetWidth),
  );
}
