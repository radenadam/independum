import type { PendingInput, PendingInputsState } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { BoxedList } from "./boxed-list.tsx";
import { IconButton } from "./icon-button.tsx";
import { MenuList } from "./menu-list.tsx";
import styles from "./pending-inputs.module.css";
import { Popover } from "./popover.tsx";
import { TextButton } from "./text-button.tsx";

/** Draws the waiting messages, what happens to each next, and the actions that change them. */
export function PendingInputs({
  pending,
  onRemove,
  onResume,
}: {
  pending: PendingInputsState;
  onRemove: (id: string) => Promise<void>;
  onResume: () => Promise<void>;
}): ReactElement | null {
  const [opened, setOpened] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const input = pending.items.find((item) => item.id === opened);
  const canResume = pending.isPaused && pending.error === null;
  async function change(action: () => Promise<void>): Promise<void> {
    setFailure(undefined);
    try {
      await action();
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "The waiting message could not be changed.",
      );
    }
  }
  if (pending.items.length === 0 && pending.error === null && !pending.isPaused) {
    return null;
  }
  return (
    <div className={styles.pending}>
      <div className={styles.heading}>
        <span>Waiting messages</span>
        {canResume ? (
          <TextButton
            label="Resume sending"
            onClick={() => {
              void change(onResume);
            }}
          />
        ) : null}
      </div>
      {pending.items.length === 0 ? null : (
        <div className={styles.list}>
          <MenuList groups={[]} layout="row" emptyNote="">
            <BoxedList
              entries={pending.items.map((item) => ({
                key: item.id,
                name: item.text,
                detail: detailOf(item, canResume),
                onOpen: () => setOpened(item.id),
                trailing:
                  item.state === "handingOff" ? null : (
                    <IconButton
                      icon="close"
                      label="Remove waiting message"
                      size="small"
                      onClick={() => {
                        void change(() => onRemove(item.id));
                      }}
                    />
                  ),
              }))}
            />
          </MenuList>
        </div>
      )}
      {input === undefined ? null : (
        <Popover label="Waiting message" place="above" onClose={() => setOpened(undefined)}>
          <div className={styles.detail}>
            <p>{input.text}</p>
            <p>
              {input.delivery === "steer"
                ? "Steers this reply. The model reads it when its current tool calls finish, before it writes again."
                : "Sends after this reply, once the agent finishes its current work and every waiting message before this one."}
            </p>
            <p>
              Model: {input.model.providerId} {input.model.modelId}. Effort:{" "}
              {input.model.thinkingLevel ?? "None"}.
            </p>
            {input.reason === null ? null : <p>{input.reason}</p>}
          </div>
        </Popover>
      )}
      {pending.error === null && failure === undefined ? null : (
        <p role="status">{failure ?? pending.error}</p>
      )}
    </div>
  );
}

// A row says what happens to its message next, in the words of its boundary, and a held row adds
// what Resume does while Resume is available.
function detailOf(input: PendingInput, canResume: boolean): string {
  if (input.state === "handingOff") {
    return "Sending now";
  }
  if (input.state === "held") {
    const reason = input.reason ?? "Held.";
    return canResume ? `${reason} Resume to send.` : reason;
  }
  return input.delivery === "steer"
    ? "Steers this reply at its next step"
    : "Sends after this reply";
}
