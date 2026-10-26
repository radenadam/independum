import type { ReactElement } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block.tsx";
import styles from "./markdown-text.module.css";

type MarkdownNode = NonNullable<ExtraProps["node"]>;
type MarkdownContent = MarkdownNode["children"][number];

/** Properties of a Markdown text. */
interface MarkdownTextProps {
  text: string;
  hasCaret: boolean;
}

const components: Components = {
  pre: ({ node }) => <CodeBlock {...readCode(node)} />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  // A reply never loads an image by itself, because the image address could carry chat content
  // to another server. The image becomes a link that the user can choose to open.
  img: ({ src, alt }) => (
    <a href={src} target="_blank" rel="noreferrer">
      {alt === undefined || alt === "" ? src : alt}
    </a>
  ),
  table: ({ children }) => (
    <div className={styles.table}>
      <table>{children}</table>
    </div>
  ),
};

/** Draws a reply formatted from Markdown, with a caret after its last line while it types. */
export function MarkdownText({ text, hasCaret }: MarkdownTextProps): ReactElement {
  return (
    <div className={hasCaret ? `${styles.markdown} ${styles.caret}` : styles.markdown}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
}

function readCode(node: MarkdownNode | undefined): { language: string; code: string } {
  const code = node?.children[0];
  if (code?.type !== "element") {
    return { language: "", code: "" };
  }
  const classNames = code.properties.className;
  const languageClass = Array.isArray(classNames)
    ? classNames.map(String).find((name) => name.startsWith("language-"))
    : undefined;
  return {
    language: languageClass?.slice("language-".length) ?? "",
    code: textOf(code).replace(/\n$/, ""),
  };
}

function textOf(node: MarkdownContent): string {
  if (node.type === "text") {
    return node.value;
  }
  return node.type === "element" ? node.children.map(textOf).join("") : "";
}
