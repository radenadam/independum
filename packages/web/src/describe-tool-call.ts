import type {
  CommandEnd,
  DiffHunk,
  FileDiff,
  ReadDetails,
  ShellDetails,
  ShellProgress,
  ToolCallPart,
  ToolImage,
  WriteDetails,
} from "independum/api-types";
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
 * How a call to a tool reads: its label, the block of code inside it, what came back, how it is
 * going, what the user can do with a running command, and how long a running command has printed
 * nothing, once that is long enough to tell the user.
 */
interface DescribedCall {
  label: string;
  language: string;
  input: string;
  output: string;
  images: ToolImage[];
  hunks: DiffHunk[];
  status: StepStatus | undefined;
  isRunning: boolean;
  canStop: boolean;
  canMove: boolean;
  quietMs: number | undefined;
}

// A running command that prints nothing for this long may be waiting for input that never comes,
// so the user hears about it. The model hears nothing.
const quietTime = 30_000;
const numberFormat = new Intl.NumberFormat("en-US");

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
  if (part.name === "Read" || part.name === "Write" || part.name === "Edit") {
    return describeFileCall(part, status, isRunning);
  }
  if (part.name !== "Shell") {
    return {
      label: labelOf(part),
      language: "json",
      input: JSON.stringify(part.input, null, 2),
      output: part.result?.text ?? "",
      images: part.result?.images ?? [],
      hunks: [],
      status,
      isRunning,
      canStop: false,
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
    images: [],
    hunks: [],
    status,
    isRunning,
    canStop: isRunning,
    // A command of the reply can go on in the background, and one already there cannot.
    canMove: isRunning && part.result === null,
    quietMs,
  };
}

// A call to a tool on a file is labeled with the name of the file, which a long path would push out
// of sight, and shows the whole path above what it holds: the text that Read returned, a new file
// that Write made, or the diff of Write or Edit above the text that it returned to the model. The
// user cannot stop it.
function describeFileCall(
  part: ToolCallPart,
  running: StepStatus | undefined,
  isRunning: boolean,
): DescribedCall {
  const { result } = part;
  const path = typeof part.input.path === "string" ? part.input.path : "";
  const name = path.split(/[\\/]/).at(-1) ?? path;
  const shared = { language: path, isRunning, canStop: false, canMove: false, quietMs: undefined };
  if (part.name === "Write" || part.name === "Edit") {
    // A new file that Write made shows its content, and every other change shows its diff.
    const details =
      result === null || result.isError
        ? undefined
        : (result.details as FileDiff & Partial<WriteDetails>);
    const content = typeof part.input.content === "string" ? part.input.content : "";
    return {
      ...shared,
      label: name,
      input: details?.isNew === true ? content : "",
      output: result?.text ?? "",
      images: [],
      hunks: details?.hunks ?? [],
      status:
        details === undefined
          ? running
          : details.isNew === true
            ? { text: `New, ${numberFormat.format(details.added)} lines`, tone: "quiet" }
            : { text: `+${details.added} -${details.removed}`, tone: "quiet" },
    };
  }
  const details = result?.details as ReadDetails | null | undefined;
  const isText = result !== null && !result.isError && details?.kind === "text";
  return {
    ...shared,
    label: readLabelOf(part.input, name),
    input: isText ? result.text : "",
    output: result === null || isText ? "" : result.text,
    images: result?.images ?? [],
    hunks: [],
    status: result === null || result.isError ? running : readStatusOf(details),
  };
}

function readLabelOf(input: Record<string, unknown>, name: string): string {
  const offset = numberOf(input.offset);
  const limit = numberOf(input.limit);
  const column = numberOf(input.column);
  const first = offset ?? 1;
  if (column !== undefined) {
    return `${name}, line ${numberFormat.format(first)} from column ${numberFormat.format(column)}`;
  }
  if (limit !== undefined) {
    const last = first + limit - 1;
    return last === first
      ? `${name}, line ${numberFormat.format(first)}`
      : `${name}, lines ${numberFormat.format(first)} to ${numberFormat.format(last)}`;
  }
  return offset === undefined ? name : `${name}, from line ${numberFormat.format(offset)}`;
}

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readStatusOf(details: ReadDetails | null | undefined): StepStatus | undefined {
  if (details?.kind === "image") {
    return {
      text: `${numberFormat.format(details.width)} by ${numberFormat.format(details.height)}`,
      tone: "quiet",
    };
  }
  if (details?.kind === "empty") {
    return { text: "Empty", tone: "quiet" };
  }
  if (details?.kind !== "text") {
    return undefined;
  }
  const { firstLine, lastLine, lineCount } = details;
  if (firstLine === 1 && lastLine === lineCount) {
    return {
      text: lineCount === 1 ? "1 line" : `${numberFormat.format(lineCount)} lines`,
      tone: "quiet",
    };
  }
  // The label already names the range that the model asked for, so the status says how much came.
  const shown = numberFormat.format(lastLine - firstLine + 1);
  return { text: `${shown} of ${numberFormat.format(lineCount)} lines`, tone: "quiet" };
}

function labelOf(part: ToolCallPart): string {
  const id = String(part.input.id ?? "");
  if (part.name === "StopCommand") {
    return `Stop background command ${id}`;
  }
  if (part.name === "CheckCommand") {
    return id === "" ? "List background commands" : `Check background command ${id}`;
  }
  return part.name;
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
