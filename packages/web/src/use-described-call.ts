import type { ToolCallPart } from "independum/api-types";
import { type DescribedCall, describeToolCall, isCallRunning } from "./describe-tool-call.ts";
import type { ToolCalls } from "./tool-step.tsx";
import { useElapsed } from "./use-elapsed.ts";

/** Returns how a call to a tool reads now, with a timer that ticks while it runs. */
export function useDescribedCall(
  part: ToolCallPart,
  tools: ToolCalls,
  isReplying: boolean,
): DescribedCall {
  const run = tools.runs[part.id];
  const end = tools.ends[part.id];
  const elapsed = useElapsed(run?.startedAt, isCallRunning(part, run, end, isReplying));
  return describeToolCall(part, run, end, isReplying, elapsed);
}
