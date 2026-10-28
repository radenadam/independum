import type { ReactElement } from "react";
import styles from "./badge.module.css";

/** Properties of a badge. */
interface BadgeProps {
  label: string;
  tone: "signal" | "quiet";
}

/**
 * Draws a small label beside a heading, orange for who owns a part of the agent and gray for its
 * state, such as read-only or edited.
 */
export function Badge({ label, tone }: BadgeProps): ReactElement {
  return <span className={styles[tone]}>{label}</span>;
}
