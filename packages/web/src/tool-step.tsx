import type { ToolCallPart } from "independum/api-types";
import type { ReactElement } from "react";
import { CodeBlock } from "./code-block.tsx";
import { describeToolCall, type ToolRun } from "./describe-tool-call.ts";
import { Icon } from "./icon.tsx";
import { StepBox } from "./step-box.tsx";
import { StopCommandButton } from "./stop-command-button.tsx";
import styles from "./tool-step.module.css";
import { useElapsed } from "./use-elapsed.ts";

/** What the chat knows about the calls to tools, and what the user can do with them. */
export interface ToolCalls {
  runs: Record<string, ToolRun>;
  shown: { id: string; at: number } | undefined;
  onStop: (id: string) => void;
}

/** Properties of a tool step. */
interface ToolStepProps {
  part: ToolCallPart;
  tools: ToolCalls;
  isReplying: boolean;
}

/**
 * Draws a call to a tool as a step: what the call is for and how it is going or how it ended, and
 * inside it what went in and what came back. A running command has a button that stops it alone.
 */
export function ToolStep({ part, tools, isReplying }: ToolStepProps): ReactElement {
  const run = tools.runs[part.id];
  const isUnderWay = part.result === null && isReplying;
  const elapsed = useElapsed(run?.startedAt, isUnderWay && run !== undefined);
  const call = describeToolCall(part, run, isReplying, elapsed);

  return (
    <StepBox
      leading={<Icon name={part.name === "Shell" ? "shell" : "agent"} size={16} />}
      label={call.label}
      status={call.status}
      action={
        call.isRunning ? <StopCommandButton onStop={() => tools.onStop(part.id)} /> : undefined
      }
      isFollowing={isUnderWay}
      hasBody={call.input !== ""}
      shownAt={tools.shown?.id === part.id ? tools.shown.at : undefined}
    >
      <div className={styles.input}>
        <CodeBlock language={call.language} code={call.input} />
      </div>
      {call.output === "" ? null : <pre className={styles.output}>{call.output}</pre>}
    </StepBox>
  );
}
