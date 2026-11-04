import { type KeyboardEvent, type PointerEvent, type ReactElement, useRef } from "react";
import styles from "./column-handle.module.css";
import { type Column, chatWidth, clampWidth, columnWidths, detailWidth } from "./column-width.ts";

/** Properties of a column handle. */
interface ColumnHandleProps {
  column: Column;
  width: number;
  onResizing?: (isResizing: boolean) => void;
  onResize: (width: number, isDone: boolean) => void;
}

// An arrow key moves the edge of a column this far.
const keyStep = 16;
const labels: Record<Column, string> = {
  start: "Resize the sidebar",
  end: "Resize the side panel",
  overview: "Resize the overview",
};
// A column grows only while what sits beside it keeps its narrowest width: the chat beside the
// sidebar and the side panel, as decision 0018 gives it, and the detail beside the overview.
const neighbors: Record<Column, { selector: string; width: number }> = {
  start: { selector: ":scope > main", width: chatWidth },
  end: { selector: ":scope > main", width: chatWidth },
  overview: { selector: ":scope > [data-detail]", width: detailWidth },
};

/**
 * Draws the handle on the inner edge of a column, which a drag, the arrow keys, Home, and End
 * resize, and a double click sets back to its initial width.
 */
export function ColumnHandle({
  column,
  width,
  onResizing,
  onResize,
}: ColumnHandleProps): ReactElement {
  const drag = useRef<{ x: number; width: number; most: number } | undefined>(undefined);
  const { initial, least, most } = columnWidths[column];
  // The handle moves the inner edge, so it widens the side panel to the left and the other columns
  // to the right.
  const toward = column === "end" ? -1 : 1;

  function resize(next: number, handle: HTMLElement): void {
    onResize(clampWidth(column, Math.min(next, widestFor(handle, column, width))), true);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      width,
      most: widestFor(event.currentTarget, column, width),
    };
    onResizing?.(true);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>): void {
    const start = drag.current;
    if (start !== undefined) {
      const moved = (event.clientX - start.x) * toward;
      onResize(clampWidth(column, Math.min(start.most, start.width + moved)), false);
    }
  }

  function endDrag(): void {
    if (drag.current !== undefined) {
      drag.current = undefined;
      onResizing?.(false);
      onResize(width, true);
    }
  }

  function moveByKey(event: KeyboardEvent<HTMLDivElement>): void {
    const next =
      event.key === "Home"
        ? least
        : event.key === "End"
          ? most
          : event.key === "ArrowRight"
            ? width + keyStep * toward
            : event.key === "ArrowLeft"
              ? width - keyStep * toward
              : undefined;
    if (next !== undefined) {
      event.preventDefault();
      resize(next, event.currentTarget);
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: A separator that moves takes the focus and the pointer, which a rule element cannot.
    <div
      className={styles.handle}
      role="separator"
      aria-orientation="vertical"
      aria-label={labels[column]}
      aria-valuemin={least}
      aria-valuemax={most}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={moveByKey}
      onDoubleClick={(event) => resize(initial, event.currentTarget)}
    />
  );
}

// Returns the widest a column can grow, which leaves what sits beside it its narrowest width.
function widestFor(handle: HTMLElement, column: Column, width: number): number {
  const { selector, width: kept } = neighbors[column];
  const neighbor = handle.parentElement?.parentElement?.querySelector(selector);
  const room = neighbor instanceof HTMLElement ? neighbor.offsetWidth - kept : 0;
  return width + Math.max(0, room);
}
