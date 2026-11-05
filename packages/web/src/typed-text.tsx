import type { ReactElement } from "react";
import styles from "./typed-text.module.css";

/** Properties of a typed text. */
interface TypedTextProps {
  text: string;
  shown: number;
  hasCaret: boolean;
}

// The untyped rest is there but hidden, so nothing moves while it types and a screen reader
// reads it whole.
/** Draws a text typed up to a number of characters, with an optional caret after them. */
export function TypedText({ text, shown, hasCaret }: TypedTextProps): ReactElement {
  return (
    <>
      {text.slice(0, shown)}
      {hasCaret ? <span className={styles.caret} aria-hidden="true" /> : null}
      <span className={styles.rest}>{text.slice(shown)}</span>
    </>
  );
}
