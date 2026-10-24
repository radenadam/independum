import type { ReactElement, ReactNode } from "react";
import styles from "./greeting.module.css";
import { RisingMark } from "./mark.tsx";

/** Properties of a greeting. */
interface GreetingProps {
  title: string;
  lines: string[];
  children?: ReactNode;
}

/** Draws a calm screen with the rising mark, a typed title, its lines, and optional commands. */
export function Greeting({ title, lines, children }: GreetingProps): ReactElement {
  return (
    <main className={styles.main}>
      <div className={styles.column}>
        <RisingMark />
        <div className={styles.text}>
          <h1 className={styles.title}>{title}</h1>
          {lines.map((line) => (
            <p key={line} className={styles.line}>
              {line}
            </p>
          ))}
        </div>
        {children === undefined ? null : <div className={styles.commands}>{children}</div>}
      </div>
    </main>
  );
}
