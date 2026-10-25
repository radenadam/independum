import type { ReactElement, ReactNode } from "react";
import styles from "./screen-layout.module.css";

/** Properties of the screen layout. */
interface ScreenLayoutProps {
  margin: ReactNode;
  children: ReactNode;
}

/** Draws a screen with its commands and places in a margin that stays in view, and its content. */
export function ScreenLayout({ margin, children }: ScreenLayoutProps): ReactElement {
  return (
    <main className={styles.main}>
      <div className={styles.margin}>{margin}</div>
      <div className={styles.content}>{children}</div>
    </main>
  );
}
