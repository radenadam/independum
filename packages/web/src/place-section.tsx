import type { ReactElement, ReactNode } from "react";
import { Badge } from "./badge.tsx";
import styles from "./place-section.module.css";

/** Properties of a place section. */
interface PlaceSectionProps {
  heading: string;
  badge?: "built-in" | "read-only";
  mark?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Draws a section of a place under a small heading, with a badge that says who owns it, a mark
 * such as edited, and its actions at the end of the heading.
 */
export function PlaceSection({
  heading,
  badge,
  mark,
  actions,
  children,
}: PlaceSectionProps): ReactElement {
  return (
    <section className={styles.section}>
      <div className={styles.headingRow}>
        <h3 className={styles.heading}>{heading}</h3>
        {badge === undefined ? null : (
          <Badge label={badge} tone={badge === "built-in" ? "signal" : "quiet"} />
        )}
        {mark === undefined ? null : <Badge label={mark} tone="quiet" />}
        {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}
