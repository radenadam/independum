import type { CommandEnd, ShellDetails, ShellProgress, ToolCallPart } from "independum/api-types";
import { describeDuration } from "./describe-duration.ts";
import type { StepStatus } from "./status-label.tsx";

/**
 * A call to a tool that has started, with when it started, the latest progress of the tool, and
 * how a command in the background ended.
 */
export interface ToolRun {
  startedAt: number;
  details: unknown;
  end?: CommandEnd;
}

/**
 * How a call to a tool reads: its label, what went in, what came back, how it is going, and how
 * long a running command has printed nothing, once that is long enough to tell the user.
 */
interface DescribedCall {
  label: string;
  language: string;
  input: string;
  output: string;
  status: StepStatus | undefined;
  isRunning: boolean;
  canMove: boolean;
  quietMs: number | undefined;
}

// A running command that prints nothing for this long may be waiting for input that never comes,
// so the user hears about it. The model hears nothing.
const quietTime = 30_000;

/**
 * Returns how a call to a tool reads in the chat and in the Commands place. A call to the Shell
 * tool reads as what the model said its command is for, or else as the first line of the command.
 */
export function describeToolCall(
  part: ToolCallPart,
  run: ToolRun | undefined,
  end: CommandEnd | undefined,
  isReplying: boolean,
  elapsed: number,
): DescribedCall {
  const isRunning = isCallRunning(part, run, end, isReplying);
  const quietMs = isRunning ? quietOf(run, elapsed) : undefined;
  const status: StepStatus | undefined =
    quietMs === undefined
      ? statusOf(part, run, end, isReplying, elapsed)
      : { text: `No output for ${describeDuration(quietMs)}`, tone: "alert" };
  if (part.name !== "Shell") {
    return {
      label:
        part.name === "StopCommand"
          ? `Stop background command ${String(part.input.id ?? "")}`
          : part.name,
      language: "json",
      input: JSON.stringify(part.input, null, 2),
      output: part.result?.text ?? "",
      status,
      isRunning,
      canMove: false,
      quietMs,
    };
  }
  const command = typeof part.input.command === "string" ? part.input.command : "";
  const description =
    typeof part.input.description === "string" ? part.input.description.trim() : "";
  const progress = shellProgressOf(run?.details);
  const details = shellDetailsOf(part.result?.details);
  // A running command shows what it prints. A command in the background keeps showing what it
  // printed, because its result only says that it started.
  const isPrinting = part.result === null || details?.ending === "background";
  return {
    label: description || command.split("\n")[0]?.trim() || "Shell",
    language: details?.shell ?? progress?.shell ?? "shell",
    input: command,
    output: (isPrinting ? progress?.output : undefined) ?? part.result?.text ?? "",
    status,
    isRunning,
    // A command of the reply can go on in the background, and one already there cannot.
    canMove: isRunning && part.result === null,
    quietMs,
  };
}

// The time now is when the run started plus how long it has run.
function quietOf(run: ToolRun | undefined, elapsed: number): number | undefined {
  const lastOutputAt = shellProgressOf(run?.details)?.lastOutputAt;
  if (run === undefined || lastOutputAt === undefined) {
    return undefined;
  }
  const quietMs = run.startedAt + elapsed - lastOutputAt;
  return quietMs >= quietTime ? quietMs : undefined;
}

/**
 * Returns whether a call to a tool still runs: in the reply until its result comes, or in the
 * background until the command ends.
 */
export function isCallRunning(
  part: ToolCallPart,
  run: ToolRun | undefined,
  end: CommandEnd | undefined,
  isReplying: boolean,
): boolean {
  if (part.result === null) {
    return isReplying && run !== undefined;
  }
  return (
    shellDetailsOf(part.result.details)?.ending === "background" &&
    end === undefined &&
    run !== undefined
  );
}

/** Returns how a background command ended, as its step and the note about it show it. */
export function statusOfEnd(
  end: Pick<CommandEnd, "ending" | "exitCode" | "signal" | "durationMs">,
): StepStatus {
  if (end.ending === "timedOut") {
    return { text: "Timed out", tone: "alert" };
  }
  if (end.ending === "stopped") {
    return { text: "Stopped", tone: "quiet" };
  }
  if (end.exitCode === null && end.signal !== null) {
    return { text: end.signal, tone: "alert" };
  }
  return end.exitCode === 0
    ? { text: describeDuration(end.durationMs), tone: "quiet" }
    : { text: `Exit code ${end.exitCode ?? "unknown"}`, tone: "alert" };
}

function statusOf(
  part: ToolCallPart,
  run: ToolRun | undefined,
  end: CommandEnd | undefined,
  isReplying: boolean,
  elapsed: number,
): StepStatus | undefined {
  const running: StepStatus = { text: describeDuration(elapsed), tone: "running" };
  if (part.result === null) {
    if (!isReplying) {
      return { text: "Not run", tone: "quiet" };
    }
    return run === undefined ? undefined : running;
  }
  const details = shellDetailsOf(part.result.details);
  if (details === undefined) {
    return part.result.isError ? { text: "Failed", tone: "alert" } : undefined;
  }
  if (details.ending !== "background") {
    const { ending, exitCode, signal, durationMs } = details;
    return statusOfEnd({ ending, exitCode, signal, durationMs });
  }
  if (end !== undefined) {
    return statusOfEnd(end);
  }
  return run === undefined ? { text: "In the background", tone: "quiet" } : running;
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
