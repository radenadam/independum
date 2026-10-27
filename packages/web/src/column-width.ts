/** The edge of the working screen that a column sits at: the sidebar at the start, the side panel at the end. */
export type ColumnEdge = "start" | "end";

/** The width that a column starts at, and the narrowest and widest it can be, in pixels. */
interface WidthRange {
  initial: number;
  least: number;
  most: number;
}

/** The widths of the sidebar and the side panel. */
export const columnWidths: Record<ColumnEdge, WidthRange> = {
  start: { initial: 272, least: 220, most: 400 },
  end: { initial: 420, least: 340, most: 640 },
};

/** The narrowest the chat gets between the columns, so it stays readable. See decision 0018. */
export const chatWidth = 480;

const storageKeys: Record<ColumnEdge, string> = {
  start: "independum.sidebarWidth",
  end: "independum.sidePanelWidth",
};

/** Keeps a width within the range of its column, in whole pixels. */
export function clampWidth(edge: ColumnEdge, width: number): number {
  const { least, most } = columnWidths[edge];
  return Math.round(Math.min(most, Math.max(least, width)));
}

/** Returns the width of a column that the user chose on this device, or its initial width. */
export function readColumnWidth(edge: ColumnEdge): number {
  const stored = Number(localStorage.getItem(storageKeys[edge]));
  return stored > 0 ? clampWidth(edge, stored) : columnWidths[edge].initial;
}

/** Remembers the width of a column on this device. */
export function saveColumnWidth(edge: ColumnEdge, width: number): void {
  localStorage.setItem(storageKeys[edge], String(width));
}
