import type { ReactElement, ReactNode } from "react";
import styles from "./screen-layout.module.css";

/** Properties of the screen layout. */
interface ScreenLayoutProps {
  aside: ReactNode;
  children: ReactNode;
}

/** Draws a screen with its commands in a narrow margin and its content beside them. */
export function ScreenLayout({ aside, children }: ScreenLayoutProps): ReactElement {
  return (
    <main className={styles.main}>
      <div className={styles.aside}>{aside}</div>
      <div className={styles.content}>{children}</div>
    </main>
  );
}
