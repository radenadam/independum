import { type CSSProperties, type ReactElement, type ReactNode, useState } from "react";
import { ColumnHandle } from "./column-handle.tsx";
import { type ColumnEdge, readColumnWidth, saveColumnWidth } from "./column-width.ts";
import styles from "./sliding-column.module.css";

/** Properties of a sliding column. */
interface SlidingColumnProps {
  element: "nav" | "aside";
  label: string;
  edge: ColumnEdge;
  isOpen: boolean;
  children: ReactNode;
}

/**
 * Draws a column at an edge of the working screen that slides open and closed, with a handle on
 * its inner edge that resizes it, and that covers the chat on a phone.
 */
export function SlidingColumn({
  element: Element,
  label,
  edge,
  isOpen,
  children,
}: SlidingColumnProps): ReactElement {
  const [width, setWidth] = useState(() => readColumnWidth(edge));
  const [isResizing, setIsResizing] = useState(false);

  const column = (
    <Element
      className={`${styles.column} ${styles[edge]}`}
      aria-label={label}
      data-open={isOpen}
      data-resizing={isResizing}
      inert={!isOpen}
      style={{ "--width": `${width}px` } as CSSProperties}
    >
      <div className={styles.inner}>{children}</div>
    </Element>
  );
  // A scrollbar runs down the right side of what scrolls, so the handle sits on the edge and reaches
  // to its right, over the chat beside the sidebar and over the side panel itself.
  const handle = isOpen ? (
    <div className={styles.edge}>
      <ColumnHandle
        column={edge}
        width={width}
        onResizing={setIsResizing}
        onResize={(next, isDone) => {
          setWidth(next);
          if (isDone) {
            saveColumnWidth(edge, next);
          }
        }}
      />
    </div>
  ) : null;
  return edge === "start" ? (
    <>
      {column}
      {handle}
    </>
  ) : (
    <>
      {handle}
      {column}
    </>
  );
}
