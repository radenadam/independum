import type { ToolCallPart } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { CommandActions, commandActionsOf } from "./command-actions.tsx";
import styles from "./commands-place.module.css";
import { isCallRunning } from "./describe-tool-call.ts";
import { Icon } from "./icon.tsx";
import { PlaceFrame, PlaceNote } from "./place-frame.tsx";
import { PlaceRow } from "./place-row.tsx";
import { PlaceSection } from "./place-section.tsx";
import { PlaceTrail } from "./place-trail.tsx";
import { RowWithAction } from "./row-with-action.tsx";
import { StatusLabel } from "./status-label.tsx";
import { ToolCallBody } from "./tool-call-body.tsx";
import type { ToolCalls } from "./tool-step.tsx";
import { useDescribedCall } from "./use-described-call.ts";

/** Properties of the Commands place. */
interface CommandsPlaceProps {
  commands: ToolCallPart[];
  tools: ToolCalls;
  isReplying: boolean;
  onShow: (id: string) => void;
}

// A command opens here, with what it ran and printed, and a way to its step in the chat.
/**
 * Draws the commands of the open chat: the ones under way on top, where each running one has a
 * button that stops it alone, and the earlier ones below, newest first.
 */
export function CommandsPlace({
  commands,
  tools,
  isReplying,
  onShow,
}: CommandsPlaceProps): ReactElement {
  const [openId, setOpenId] = useState<string | undefined>();
  const open = commands.find((part) => part.id === openId);
  // A command is under way while the model writes it, while it runs in the reply, and while it
  // runs in the background after the reply.
  const underWay = commands.filter(
    (part) =>
      (part.result === null && isReplying) ||
      isCallRunning(part, tools.runs[part.id], tools.ends[part.id], isReplying),
  );
  const earlier = commands.filter((part) => !underWay.includes(part)).reverse();
  const groups = [
    { heading: "Running", parts: underWay },
    { heading: "Earlier", parts: earlier },
  ];

  // The list and a command each scroll on their own, so a command opens at its top.
  if (open !== undefined) {
    return (
      <div key={open.id} className={styles.place}>
        <PlaceTrail back={{ label: "Commands", onBack: () => setOpenId(undefined) }} />
        <PlaceFrame>
          <CommandDetail
            part={open}
            tools={tools}
            isReplying={isReplying}
            onShow={() => onShow(open.id)}
          />
        </PlaceFrame>
      </div>
    );
  }
  return (
    <div className={styles.place}>
      <PlaceFrame>
        {commands.length === 0 ? (
          <PlaceNote>The commands that the agent runs in this chat show here.</PlaceNote>
        ) : null}
        {groups.map((group) =>
          group.parts.length === 0 ? null : (
            <PlaceSection key={group.heading} heading={group.heading}>
              <div className={styles.list}>
                {group.parts.map((part) => (
                  <CommandRow
                    key={part.id}
                    part={part}
                    tools={tools}
                    isReplying={isReplying}
                    onOpen={() => setOpenId(part.id)}
                  />
                ))}
              </div>
            </PlaceSection>
          ),
        )}
      </PlaceFrame>
    </div>
  );
}

/** Properties of a command row. */
interface CommandRowProps {
  part: ToolCallPart;
  tools: ToolCalls;
  isReplying: boolean;
  onOpen: () => void;
}

// A command without a description already reads as its first line, so the line shows only once.
function CommandRow({ part, tools, isReplying, onOpen }: CommandRowProps): ReactElement {
  const call = useDescribedCall(part, tools, isReplying);
  const firstLine = call.input.split("\n")[0]?.trim() ?? "";
  const row = (
    <PlaceRow
      icon={<Icon name="shell" size={16} />}
      label={call.label}
      glance={firstLine === call.label ? undefined : firstLine}
      isGlanceCode
      status={call.status}
      onOpen={onOpen}
    />
  );
  return call.isRunning ? (
    <RowWithAction
      isActionShown
      action={<CommandActions id={part.id} canMove={call.canMove} tools={tools} />}
    >
      {row}
    </RowWithAction>
  ) : (
    row
  );
}

/** Properties of the detail of a command. */
interface CommandDetailProps {
  part: ToolCallPart;
  tools: ToolCalls;
  isReplying: boolean;
  onShow: () => void;
}

// A command shows here as its step shows in the chat, and keeps up while it runs.
function CommandDetail({ part, tools, isReplying, onShow }: CommandDetailProps): ReactElement {
  const call = useDescribedCall(part, tools, isReplying);
  return (
    <>
      <PlaceSection heading={call.label} actions={commandActionsOf(part.id, call, tools)}>
        {call.status === undefined ? null : (
          <p className={styles.status}>
            <StatusLabel status={call.status} />
          </p>
        )}
        <ToolCallBody call={call} />
      </PlaceSection>
      <PlaceSection heading="In the chat">
        <PlaceRow label="Show in chat" glance="Where the model ran it" onOpen={onShow} />
      </PlaceSection>
    </>
  );
}
