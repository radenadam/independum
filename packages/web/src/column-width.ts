/** The edge of the working screen that a column sits at: the sidebar at the start, the side panel at the end. */
export type ColumnEdge = "start" | "end";

/** A column that the user resizes: the sidebar, the side panel, or the overview of Session beside a detail. */
export type Column = ColumnEdge | "overview";

/** The width that a column starts at, and the narrowest and widest it can be, in pixels. */
interface WidthRange {
  initial: number;
  least: number;
  most: number;
}

/** The widths of the sidebar, the side panel, and the overview of Session. */
export const columnWidths: Record<Column, WidthRange> = {
  start: { initial: 272, least: 220, most: 400 },
  end: { initial: 420, least: 340, most: 960 },
  overview: { initial: 380, least: 300, most: 600 },
};

// See decision 0018.
/** The narrowest the chat gets between the columns, so it stays readable. */
export const chatWidth = 480;

/** The narrowest the detail beside the overview of Session gets, so a tool card still fits. */
export const detailWidth = 320;

const storageKeys: Record<Column, string> = {
  start: "independum.sidebarWidth",
  end: "independum.sidePanelWidth",
  overview: "independum.sessionOverviewWidth",
};

/** Keeps a width within the range of its column, in whole pixels. */
export function clampWidth(column: Column, width: number): number {
  const { least, most } = columnWidths[column];
  return Math.round(Math.min(most, Math.max(least, width)));
}

/** Returns the width of a column that the user chose on this device, or its initial width. */
export function readColumnWidth(column: Column): number {
  const stored = Number(localStorage.getItem(storageKeys[column]));
  return stored > 0 ? clampWidth(column, stored) : columnWidths[column].initial;
}

/** Remembers the width of a column on this device. */
export function saveColumnWidth(column: Column, width: number): void {
  localStorage.setItem(storageKeys[column], String(width));
}
