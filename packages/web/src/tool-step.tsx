import type { ShellDetails, ShellProgress, ToolCallPart } from "independum/api-types";
import { type ReactElement, useEffect, useState } from "react";
import { CodeBlock } from "./code-block.tsx";
import { describeDuration } from "./describe-duration.ts";
import { Icon } from "./icon.tsx";
import { StepBox, type StepStatus } from "./step-box.tsx";
import styles from "./tool-step.module.css";

/** A call to a tool that has started, with when it started and the latest progress of the tool. */
export interface ToolRun {
  startedAt: number;
  details: unknown;
}

/** Properties of a tool step. */
interface ToolStepProps {
  part: ToolCallPart;
  run: ToolRun | undefined;
  isReplying: boolean;
}

// The timer of a running step moves this often.
const tickInterval = 100;

/**
 * Draws a call to a tool as a step: what the call is for and how it is going or how it ended, and
 * inside it what went in and what came back. A call to the Shell tool shows its command in its
 * shell and the output as it runs.
 */
export function ToolStep({ part, run, isReplying }: ToolStepProps): ReactElement {
  const isUnderWay = part.result === null && isReplying;
  const elapsed = useElapsed(run?.startedAt, isUnderWay && run !== undefined);
  const shown = part.name === "Shell" ? shellStepOf(part, run) : otherStepOf(part);

  return (
    <StepBox
      leading={<Icon name={part.name === "Shell" ? "shell" : "agent"} size={16} />}
      label={shown.label}
      status={statusOf(part, run, isReplying, elapsed)}
      isFollowing={isUnderWay}
      hasBody={shown.input !== ""}
    >
      <div className={styles.input}>
        <CodeBlock language={shown.language} code={shown.input} />
      </div>
      {shown.output === "" ? null : <pre className={styles.output}>{shown.output}</pre>}
    </StepBox>
  );
}

/** What a step shows: its label, what went in and in which language, and what came back. */
interface ShownStep {
  label: string;
  language: string;
  input: string;
  output: string;
}

// A step reads as what the model said the command is for, or else as its first line, until the
// model has written either.
function shellStepOf(part: ToolCallPart, run: ToolRun | undefined): ShownStep {
  const command = typeof part.input.command === "string" ? part.input.command : "";
  const description =
    typeof part.input.description === "string" ? part.input.description.trim() : "";
  const progress = shellProgressOf(run?.details);
  const details = shellDetailsOf(part.result?.details);
  return {
    label: description || command.split("\n")[0]?.trim() || "Shell",
    language: details?.shell ?? progress?.shell ?? "shell",
    input: command,
    output: part.result?.text ?? progress?.output ?? "",
  };
}

function otherStepOf(part: ToolCallPart): ShownStep {
  return {
    label: part.name,
    language: "json",
    input: JSON.stringify(part.input, null, 2),
    output: part.result?.text ?? "",
  };
}

function statusOf(
  part: ToolCallPart,
  run: ToolRun | undefined,
  isReplying: boolean,
  elapsed: number,
): StepStatus | undefined {
  if (part.result === null) {
    if (!isReplying) {
      return { text: "Not run", tone: "quiet" };
    }
    return run === undefined ? undefined : { text: describeDuration(elapsed), tone: "running" };
  }
  const details = shellDetailsOf(part.result.details);
  if (details === undefined) {
    return part.result.isError ? { text: "Failed", tone: "alert" } : undefined;
  }
  if (details.ending === "timedOut") {
    return { text: "Timed out", tone: "alert" };
  }
  if (details.ending === "stopped") {
    return { text: "Stopped", tone: "quiet" };
  }
  return details.exitCode === 0
    ? { text: describeDuration(details.durationMs), tone: "quiet" }
    : { text: `Exit code ${details.exitCode ?? "unknown"}`, tone: "alert" };
}

function shellDetailsOf(details: unknown): ShellDetails | undefined {
  return typeof details === "object" && details !== null && "ending" in details
    ? (details as ShellDetails)
    : undefined;
}

function shellProgressOf(details: unknown): ShellProgress | undefined {
  return typeof details === "object" && details !== null && "output" in details
    ? (details as ShellProgress)
    : undefined;
}

function useElapsed(startedAt: number | undefined, isRunning: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), tickInterval);
    return () => clearInterval(timer);
  }, [isRunning]);

  return startedAt === undefined ? 0 : Math.max(0, now - startedAt);
}
