import type { ContextSummary, TokenCounts } from "independum/api-types";
import { Fragment, type ReactElement } from "react";
import styles from "./usage-table.module.css";

/** Properties of the usage table. */
interface UsageTableProps {
  context: ContextSummary;
}

const numberFormat = new Intl.NumberFormat();
// Each row says in its name what it counts, such as input that the cache did not hold.
const rows: { key: keyof TokenCounts; name: string; isPart?: boolean }[] = [
  { key: "input", name: "Input, fresh" },
  { key: "cacheRead", name: "Input, from cache" },
  { key: "cacheWrite", name: "Written to cache" },
  { key: "output", name: "Output" },
  { key: "reasoning", name: "of which thinking", isPart: true },
];

/**
 * Draws the tokens and the cost of the last reply beside those of the whole chat, each with what it
 * counts, and how many messages the chat holds.
 */
export function UsageTable({ context }: UsageTableProps): ReactElement {
  const last = context.lastUse;
  return (
    <div className={styles.usage}>
      <div className={styles.table}>
        <span />
        <span className={styles.column}>Last reply</span>
        <span className={styles.column}>Whole chat</span>
        {rows.map((row) => (
          <Fragment key={row.key}>
            <span className={styles.name} data-part={row.isPart === true}>
              {row.name}
            </span>
            <span className={styles.number}>
              {last === null ? "None yet" : numberFormat.format(last.tokens[row.key])}
            </span>
            <span className={styles.number}>{numberFormat.format(context.tokens[row.key])}</span>
          </Fragment>
        ))}
        <span className={styles.name}>Cost</span>
        <span className={styles.number}>{last === null ? "None yet" : costOf(last.cost)}</span>
        <span className={styles.number}>{costOf(context.cost)}</span>
      </div>
      <p className={styles.counts}>
        {countOf(context.userMessages, "message", "messages")} from you,{" "}
        {countOf(context.assistantMessages, "reply", "replies")},{" "}
        {countOf(context.toolCalls, "tool call", "tool calls")}
      </p>
    </div>
  );
}

function countOf(count: number, one: string, many: string): string {
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
