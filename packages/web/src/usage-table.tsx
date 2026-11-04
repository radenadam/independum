import type { TokenCounts } from "independum/api-types";
import type { ReactElement } from "react";
import { FactTable } from "./fact-table.tsx";

/** The tokens and the cost of one request or of several, or nothing yet. */
type Use = { tokens: TokenCounts; cost: number } | null;

/** Properties of the usage table. */
interface UsageTableProps {
  columns: { name: string; use: Use }[];
}

const numberFormat = new Intl.NumberFormat();
/** The rows of tokens, each named for what it counts, such as input that the cache did not hold. */
export const tokenRows: { key: keyof TokenCounts; name: string; isPart?: boolean }[] = [
  { key: "input", name: "Input, fresh" },
  { key: "cacheRead", name: "Input, from cache" },
  { key: "cacheWrite", name: "Written to cache" },
  { key: "output", name: "Output" },
  { key: "reasoning", name: "of which thinking", isPart: true },
];

/**
 * Draws the tokens and the cost of each column side by side, such as the last reply beside the
 * whole chat, each row named for what it counts.
 */
export function UsageTable({ columns }: UsageTableProps): ReactElement {
  return (
    <FactTable
      columns={columns.map((column) => column.name)}
      rows={[
        ...tokenRows.map((row) => ({
          name: row.name,
          isPart: row.isPart,
          values: columns.map((column) =>
            column.use === null ? "None yet" : numberFormat.format(column.use.tokens[row.key]),
          ),
        })),
        {
          name: "Cost",
          values: columns.map((column) =>
            column.use === null ? "None yet" : costOf(column.use.cost),
          ),
        },
      ]}
    />
  );
}

/** Returns a count with the word for one or for many, such as 1 reply or 3 replies. */
export function countOf(count: number, one: string, many: string): string {
  return `${numberFormat.format(count)} ${count === 1 ? one : many}`;
}

// A small cost keeps more digits, so a cheap chat does not read as free.
function costOf(cost: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cost > 0 && cost < 0.01 ? 4 : 2,
  }).format(cost);
}
