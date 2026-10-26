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
  isNarrow?: boolean;
}

// A pop-up at a point keeps this far from the edges of the screen.
const edgeGap = 8;

/**
 * Draws a pop-up beside its button or at a point, with an optional note at its foot, which closes
 * on Escape or on a click anywhere outside it.
 */
export function Popover({
  label,
  place,
  onClose,
  children,
  note,
  isNarrow = false,
}: PopoverProps): ReactElement {
  const popover = useRef<HTMLDivElement>(null);
  const point = typeof place === "string" ? undefined : place;
  const [moved, setMoved] = useState(point);

  // A pop-up at a point opens below and to the right of it, and turns back when it would leave the
  // screen, as a menu that opens near the edge does.
  useLayoutEffect(() => {
    const element = popover.current;
    if (point === undefined || element === null) {
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    setMoved({
      x:
        point.x + width > window.innerWidth - edgeGap
          ? Math.max(edgeGap, point.x - width)
          : point.x,
      y:
        point.y + height > window.innerHeight - edgeGap
          ? Math.max(edgeGap, point.y - height)
          : point.y,
    });
  }, [point]);

  const variables =
    moved === undefined
      ? undefined
      : ({ "--x": `${moved.x}px`, "--y": `${moved.y}px` } as CSSProperties);
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
        className={`${styles.popover} ${placeClass} ${isNarrow ? styles.narrow : ""}`}
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
