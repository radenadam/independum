import type { ShellDetails, ShellProgress, ToolCallPart } from "independum/api-types";
import { describeDuration } from "./describe-duration.ts";
import type { StepStatus } from "./status-label.tsx";

/** A call to a tool that has started, with when it started and the latest progress of the tool. */
export interface ToolRun {
  startedAt: number;
  details: unknown;
}

/** How a call to a tool reads: its label, what went in, what came back, and how it is going. */
interface DescribedCall {
  label: string;
  language: string;
  input: string;
  output: string;
  status: StepStatus | undefined;
  isRunning: boolean;
}

/**
 * Returns how a call to a tool reads in the chat and in the Commands place. A call to the Shell
 * tool reads as what the model said its command is for, or else as the first line of the command.
 */
export function describeToolCall(
  part: ToolCallPart,
  run: ToolRun | undefined,
  isReplying: boolean,
  elapsed: number,
): DescribedCall {
  const isRunning = part.result === null && isReplying && run !== undefined;
  const status = statusOf(part, run, isReplying, elapsed);
  if (part.name !== "Shell") {
    return {
      label: part.name,
      language: "json",
      input: JSON.stringify(part.input, null, 2),
      output: part.result?.text ?? "",
      status,
      isRunning,
    };
  }
  const command = typeof part.input.command === "string" ? part.input.command : "";
  const description =
    typeof part.input.description === "string" ? part.input.description.trim() : "";
  const progress = shellProgressOf(run?.details);
  return {
    label: description || command.split("\n")[0]?.trim() || "Shell",
    language: shellDetailsOf(part.result?.details)?.shell ?? progress?.shell ?? "shell",
    input: command,
    output: part.result?.text ?? progress?.output ?? "",
    status,
    isRunning,
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
