import type { ContextSummary, TokenCounts } from "independum/api-types";
import { Fragment, type ReactElement } from "react";
import { InfoTip } from "./info-tip.tsx";
import styles from "./usage-table.module.css";

/** Properties of the usage table. */
interface UsageTableProps {
  context: ContextSummary;
}

const numberFormat = new Intl.NumberFormat();
const rows: { key: keyof TokenCounts; name: string; meaning: string; isPart?: boolean }[] = [
  {
    key: "input",
    name: "Input",
    meaning: "Tokens that the model read fresh, not from the cache.",
  },
  {
    key: "cacheRead",
    name: "Cache read",
    meaning: "Tokens that the model read from the cache of an earlier request, which cost less.",
  },
  {
    key: "cacheWrite",
    name: "Cache write",
    meaning: "Tokens that the provider stored in its cache for later requests.",
  },
  {
    key: "output",
    name: "Output",
    meaning: "Tokens that the model wrote, its thinking included.",
  },
  {
    key: "reasoning",
    name: "Reasoning",
    meaning: "The part of the output that the model spent thinking. Only some providers report it.",
    isPart: true,
  },
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
        <span className={styles.column}>
          Last reply
          <InfoTip text="The request that brought the latest reply." />
        </span>
        <span className={styles.column}>
          Whole chat
          <InfoTip text="Every request of this chat added up." />
        </span>
        {rows.map((row) => (
          <Fragment key={row.key}>
            <span className={styles.name} data-part={row.isPart === true}>
              {row.name}
              <InfoTip text={row.meaning} />
            </span>
            <span className={styles.number}>
              {last === null ? "None yet" : numberFormat.format(last.tokens[row.key])}
            </span>
            <span className={styles.number}>{numberFormat.format(context.tokens[row.key])}</span>
          </Fragment>
        ))}
        <span className={styles.name}>
          Cost
          <InfoTip text="What the provider charges, from the prices that Pi knows." />
        </span>
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
