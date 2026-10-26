import type { ReactElement, ReactNode } from "react";
import styles from "./place-section.module.css";

/** Properties of a place section. */
interface PlaceSectionProps {
  heading: string;
  badge?: "built-in" | "read-only";
  children: ReactNode;
}

/** Draws a section of a place under a small heading, with a badge that says who owns it. */
export function PlaceSection({ heading, badge, children }: PlaceSectionProps): ReactElement {
  return (
    <section className={styles.section}>
      <div className={styles.headingRow}>
        <h3 className={styles.heading}>{heading}</h3>
        {badge === undefined ? null : (
          <span className={badge === "built-in" ? styles.builtIn : styles.readOnly}>{badge}</span>
        )}
      </div>
      {children}
    </section>
  );
}
