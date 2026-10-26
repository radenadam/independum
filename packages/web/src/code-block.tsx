import type { ReactElement } from "react";
import styles from "./code-block.module.css";
import { CopyButton } from "./copy-button.tsx";

/** Properties of a code block. */
interface CodeBlockProps {
  language: string;
  code: string;
}

/** Draws a block of code in a reply, with its language and a button that copies it. */
export function CodeBlock({ language, code }: CodeBlockProps): ReactElement {
  return (
    <div className={styles.block}>
      <div className={styles.header}>
        <span>{language === "" ? "code" : language}</span>
        <CopyButton text={code} label="Copy code" tipAlign="end" />
      </div>
      <pre className={styles.code}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
