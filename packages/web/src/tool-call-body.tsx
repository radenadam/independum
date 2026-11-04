import type { ReactElement } from "react";
import { CodeBlock } from "./code-block.tsx";
import { describeDuration } from "./describe-duration.ts";
import type { DescribedCall } from "./describe-tool-call.ts";
import { DiffView } from "./diff-view.tsx";
import styles from "./tool-call-body.module.css";

/** Properties of the body of a call. */
interface ToolCallBodyProps {
  call: DescribedCall;
}

/**
 * Draws what went into a call to a tool and what came back: its input, its changes, its output and
 * images, and a note when a command has printed nothing for a while.
 */
export function ToolCallBody({ call }: ToolCallBodyProps): ReactElement {
  return (
    <>
      {call.input === "" ? null : (
        <div className={styles.input}>
          <CodeBlock language={call.language} code={call.input} isFlush />
        </div>
      )}
      {call.hunks.length === 0 ? null : <DiffView path={call.language} hunks={call.hunks} />}
      {call.output === "" ? null : <pre className={styles.output}>{call.output}</pre>}
      {call.images.map((image) => (
        <img
          key={image.data.slice(-32)}
          className={styles.image}
          src={`data:${image.mimeType};base64,${image.data}`}
          alt="What the model saw"
        />
      ))}
      {call.quietMs === undefined ? null : (
        <p className={styles.quiet}>
          It has printed nothing for {describeDuration(call.quietMs)}, so it may be waiting for
          input that never comes. Stop it, or let it run.
        </p>
      )}
    </>
  );
}
