import type { ReactElement } from "react";
import { describeDuration } from "./describe-duration.ts";
import styles from "./message-time.module.css";
import { useTooltip } from "./use-tooltip.tsx";

/** Properties of a message time. */
interface MessageTimeProps {
  timestamp: number;
  durationMs: number | null;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "medium" });

/**
 * Draws when a message was sent, with its day when that was not today, and how long a reply took,
 * with the full date and time on hover.
 */
export function MessageTime({ timestamp, durationMs }: MessageTimeProps): ReactElement {
  const date = new Date(timestamp);
  const isToday = date.toDateString() === new Date().toDateString();
  const tip = useTooltip(fullFormat.format(date));
  return (
    <span className={styles.time}>
      <time dateTime={date.toISOString()} {...tip.handlers}>
        {(isToday ? timeFormat : dayFormat).format(date)}
        {tip.tooltip}
      </time>
      {durationMs === null ? null : <span>Took {describeDuration(durationMs)}</span>}
    </span>
  );
}
