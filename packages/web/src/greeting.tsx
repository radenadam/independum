import type { ReactElement, ReactNode } from "react";
import styles from "./greeting.module.css";
import { RisingMark } from "./mark.tsx";
import { type Typing, useTypedLength } from "./use-typed-length.ts";

/** Properties of a greeting. */
interface GreetingProps {
  title: string;
  lines: string[];
  children?: ReactNode;
}

const greetingTyping: Typing = { charactersPerSecond: 48, isCatchingUp: false };
// The pause before each part, as a number of characters at the typing pace.
const pause = 14;

/**
 * Draws a calm screen with the rising mark, a title and lines that type themselves in, and
 * commands that appear once the typing ends.
 */
export function Greeting({ title, lines, children }: GreetingProps): ReactElement {
  const parts = [title, ...lines];
  const starts: number[] = [];
  let end = 0;
  for (const part of parts) {
    starts.push(end + pause);
    end += pause + part.length;
  }
  const typed = useTypedLength(end, greetingTyping);
  const typingIndex = parts.findIndex((part, index) => typed < (starts[index] ?? 0) + part.length);

  // The whole text is there from the start, with its untyped rest hidden, so nothing moves while
  // it types and a screen reader reads every sentence at once.
  function render(index: number): ReactNode {
    const part = parts[index] ?? "";
    const shown = Math.max(0, Math.min(part.length, typed - (starts[index] ?? 0)));
    return (
      <>
        {part.slice(0, shown)}
        {index === typingIndex ? <span className={styles.caret} aria-hidden="true" /> : null}
        <span className={styles.rest}>{part.slice(shown)}</span>
      </>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.column}>
        <RisingMark />
        <div className={styles.text}>
          <h1 className={styles.title}>{render(0)}</h1>
          {lines.map((line, index) => (
            <p key={line} className={styles.line}>
              {render(index + 1)}
            </p>
          ))}
        </div>
        {children === undefined ? null : (
          <div
            className={typingIndex === -1 ? `${styles.commands} ${styles.ready}` : styles.commands}
          >
            {children}
          </div>
        )}
      </div>
    </main>
  );
}
