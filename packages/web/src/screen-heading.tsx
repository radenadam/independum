import type { ReactElement, ReactNode } from "react";
import { HeadingRow } from "./heading-row.tsx";
import styles from "./screen-heading.module.css";

/** Properties of a screen heading. */
interface ScreenHeadingProps {
  title: string;
  intro: string;
  command?: ReactNode;
}

/** Draws the title of a screen with a short introduction, and an optional command beside it. */
export function ScreenHeading({ title, intro, command }: ScreenHeadingProps): ReactElement {
  return (
    <div className={styles.heading}>
      <HeadingRow heading={<h1 className={styles.title}>{title}</h1>} command={command} />
      <p className={styles.intro}>{intro}</p>
    </div>
  );
}
