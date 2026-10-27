import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
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

  // A pop-up beside its button slides along when it would leave its column. A pop-up at a point
  // opens below and to the right of it, and turns back at an edge, as a menu near the edge does.
  // Sizes come from the offset sizes, which the opening animation does not scale.
  useLayoutEffect(() => {
    const element = popover.current;
    if (element === null) {
      return;
    }
    if (point === undefined) {
      setVariables({ "--shift": `${shiftInColumn(element)}px` } as CSSProperties);
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
  }, [point]);

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

// Returns how far a pop-up centered on its button slides so that it stays inside the column it
// opens in, such as the chat, and never spills over the sidebar. A sheet on a phone is fixed to the
// screen, so it has no button to center on and stays put.
function shiftInColumn(element: HTMLElement): number {
  const button = element.offsetParent;
  if (!(button instanceof HTMLElement)) {
    return 0;
  }
  const column = (
    element.closest("main, aside, nav") ?? document.documentElement
  ).getBoundingClientRect();
  const box = button.getBoundingClientRect();
  const left = box.left + box.width / 2 - element.offsetWidth / 2;
  const right = left + element.offsetWidth;
  if (left < column.left + edgeGap) {
    return column.left + edgeGap - left;
  }
  if (right > column.right - edgeGap) {
    return column.right - edgeGap - right;
  }
  return 0;
}
