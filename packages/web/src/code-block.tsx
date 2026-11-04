import type { ReactElement } from "react";
import styles from "./code-block.module.css";
import { CopyButton } from "./copy-button.tsx";

/** Properties of a code block. */
interface CodeBlockProps {
  language: string;
  code: string;
  isFlush?: boolean;
}

/**
 * Draws a block of code in a reply, with its language and a button that copies it, and without the
 * space around it where it is the only thing in its box, such as the input of a step.
 */
export function CodeBlock({ language, code, isFlush = false }: CodeBlockProps): ReactElement {
  return (
    <div className={styles.block} data-language={language} data-flush={isFlush}>
      <div className={styles.header} data-copy="skip">
        <span>{language === "" ? "code" : language}</span>
        <CopyButton text={code} label="Copy code" tipAlign="end" />
      </div>
      <pre className={styles.code}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
