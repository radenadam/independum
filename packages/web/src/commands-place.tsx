import type { ToolCallPart } from "independum/api-types";
import type { ReactElement } from "react";
import styles from "./commands-place.module.css";
import { describeToolCall } from "./describe-tool-call.ts";
import { Icon } from "./icon.tsx";
import { PlaceFrame, PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { RowWithAction } from "./row-with-action.tsx";
import { SlidingTitle } from "./sliding-title.tsx";
import { StatusLabel } from "./status-label.tsx";
import { StopCommandButton } from "./stop-command-button.tsx";
import type { ToolCalls } from "./tool-step.tsx";
import { useElapsed } from "./use-elapsed.ts";

/** Properties of the Commands place. */
interface CommandsPlaceProps {
  commands: ToolCallPart[];
  tools: ToolCalls;
  isReplying: boolean;
  onShow: (id: string) => void;
}

/**
 * Draws the commands of the open chat: the ones under way on top, where each running one has a
 * button that stops it alone, and the earlier ones below, newest first. A command opens its step in
 * the chat.
 */
export function CommandsPlace({
  commands,
  tools,
  isReplying,
  onShow,
}: CommandsPlaceProps): ReactElement {
  const underWay = commands.filter((part) => part.result === null && isReplying);
  const earlier = commands.filter((part) => !underWay.includes(part)).reverse();
  const groups = [
    { heading: "Running", parts: underWay },
    { heading: "Earlier", parts: earlier },
  ];

  return (
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
                  onShow={onShow}
                />
              ))}
            </div>
          </PlaceSection>
        ),
      )}
    </PlaceFrame>
  );
}

/** Properties of a command row. */
interface CommandRowProps {
  part: ToolCallPart;
  tools: ToolCalls;
  isReplying: boolean;
  onShow: (id: string) => void;
}

// A command without a description already reads as its first line, so the line shows only once.
function CommandRow({ part, tools, isReplying, onShow }: CommandRowProps): ReactElement {
  const run = tools.runs[part.id];
  const elapsed = useElapsed(
    run?.startedAt,
    part.result === null && isReplying && run !== undefined,
  );
  const call = describeToolCall(part, run, isReplying, elapsed);
  const firstLine = call.input.split("\n")[0]?.trim() ?? "";
  const row = (
    <button type="button" className={styles.row} onClick={() => onShow(part.id)}>
      <Icon name="shell" size={16} />
      <span className={styles.text}>
        <span className={styles.label}>
          <SlidingTitle text={call.label} />
        </span>
        {firstLine === "" || firstLine === call.label ? null : (
          <span className={styles.command}>
            <SlidingTitle text={firstLine} />
          </span>
        )}
      </span>
      {call.status === undefined ? null : <StatusLabel status={call.status} />}
    </button>
  );
  return call.isRunning ? (
    <RowWithAction
      isActionShown
      action={<StopCommandButton onStop={() => tools.onStop(part.id)} />}
    >
      {row}
    </RowWithAction>
  ) : (
    row
  );
}
