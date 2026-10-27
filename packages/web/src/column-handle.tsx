import { type KeyboardEvent, type PointerEvent, type ReactElement, useRef } from "react";
import styles from "./column-handle.module.css";
import { type ColumnEdge, chatWidth, clampWidth, columnWidths } from "./column-width.ts";

/** Properties of a column handle. */
interface ColumnHandleProps {
  edge: ColumnEdge;
  width: number;
  onResizing: (isResizing: boolean) => void;
  onResize: (width: number, isDone: boolean) => void;
}

// An arrow key moves the edge of a column this far.
const keyStep = 16;

/**
 * Draws the handle on the inner edge of a column, which a drag, the arrow keys, Home, and End
 * resize, and a double click sets back to its initial width.
 */
export function ColumnHandle({
  edge,
  width,
  onResizing,
  onResize,
}: ColumnHandleProps): ReactElement {
  const drag = useRef<{ x: number; width: number; most: number } | undefined>(undefined);
  const { initial, least, most } = columnWidths[edge];
  // The handle moves the inner edge, so it widens the sidebar to the right and the side panel to
  // the left.
  const toward = edge === "start" ? 1 : -1;

  function resize(next: number, handle: HTMLElement): void {
    onResize(clampWidth(edge, Math.min(next, widestFor(handle, width))), true);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width, most: widestFor(event.currentTarget, width) };
    onResizing(true);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>): void {
    const start = drag.current;
    if (start !== undefined) {
      const moved = (event.clientX - start.x) * toward;
      onResize(clampWidth(edge, Math.min(start.most, start.width + moved)), false);
    }
  }

  function endDrag(): void {
    if (drag.current !== undefined) {
      drag.current = undefined;
      onResizing(false);
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
      aria-label={edge === "start" ? "Resize the sidebar" : "Resize the side panel"}
      aria-valuemin={least}
      aria-valuemax={most}
      aria-valuenow={width}
      tabIndex={0}
      data-edge={edge}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={moveByKey}
      onDoubleClick={(event) => resize(initial, event.currentTarget)}
    />
  );
}

// Returns the widest a column can grow, which leaves the chat beside it the width that decision
// 0018 gives it.
function widestFor(handle: HTMLElement, width: number): number {
  const chat = handle.parentElement?.parentElement?.querySelector(":scope > main");
  const room = chat instanceof HTMLElement ? chat.offsetWidth - chatWidth : 0;
  return width + Math.max(0, room);
}
