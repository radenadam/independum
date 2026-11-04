import type { ChatMessage, CommandEnd, ToolCallPart } from "independum/api-types";
import type { ReactElement } from "react";
import { commandActionsOf } from "./command-actions.tsx";
import { statusOfEnd, type ToolRun } from "./describe-tool-call.ts";
import { Icon } from "./icon.tsx";
import { StepBox } from "./step-box.tsx";
import styles from "./tool-call-body.module.css";
import { ToolCallBody } from "./tool-call-body.tsx";
import { toolIconOf } from "./tool-icon.ts";
import { useDescribedCall } from "./use-described-call.ts";

/** What the chat knows about the calls to tools, and what the user can do with them. */
export interface ToolCalls {
  runs: Record<string, ToolRun>;
  ends: Record<string, CommandEnd>;
  shown: { id: string; at: number } | undefined;
  onMove: (id: string) => void;
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
  const isUnderWay = part.result === null && isReplying;
  const call = useDescribedCall(part, tools, isReplying);

  return (
    <StepBox
      leading={<Icon name={toolIconOf(part.name)} size={16} />}
      label={call.label}
      status={call.status}
      action={commandActionsOf(part.id, call, tools)}
      isFollowing={isUnderWay}
      hasBody={
        call.input !== "" || call.output !== "" || call.images.length > 0 || call.hunks.length > 0
      }
      shownAt={tools.shown?.id === part.id ? tools.shown.at : undefined}
    >
      <ToolCallBody call={call} />
    </StepBox>
  );
}

/** Properties of a note step. */
interface NoteStepProps {
  message: ChatMessage;
}

/**
 * Draws a note that woke the agent, such as the end of a background command, as a step that holds
 * the exact text that the model read.
 */
export function NoteStep({ message }: NoteStepProps): ReactElement {
  const end = message.commandEnd;
  const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  const label =
    end === null
      ? "Note"
      : end.isStoppedByUser
        ? `You stopped background command ${end.id}`
        : end.ending === "timedOut"
          ? `Background command ${end.id} timed out`
          : `Background command ${end.id} ended`;
  return (
    <StepBox
      leading={<Icon name="shell" size={16} />}
      label={label}
      status={end === null ? undefined : statusOfEnd(end)}
      isFollowing={false}
      hasBody={text !== ""}
    >
      <pre className={styles.output}>{text}</pre>
    </StepBox>
  );
}
