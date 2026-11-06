import type { BranchChoice, BranchCount, ChatState } from "independum/api-types";
import { type ReactElement, useState } from "react";
import styles from "./branch-switcher.module.css";
import { fetchBranchChoices, selectChatBranch } from "./chat-api.ts";
import { MenuList } from "./menu-list.tsx";
import { PlaceRow } from "./place-row.tsx";
import { Popover } from "./popover.tsx";

/** Properties of a prompt or reply alternative tile. */
interface BranchSwitcherProps {
  chat: ChatState;
  sourceId: string;
  kind: "prompt" | "reply";
  count: BranchCount | undefined;
}

/** Opens saved alternatives and restores their last visited descendants. */
export function BranchSwitcher({
  chat,
  sourceId,
  kind,
  count,
}: BranchSwitcherProps): ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);
  const [choices, setChoices] = useState<BranchChoice[]>([]);
  const [failure, setFailure] = useState<string | undefined>();
  const [isSelecting, setIsSelecting] = useState(false);
  if (count === undefined || count.count < 2) {
    return null;
  }
  const label = kind === "prompt" ? "Prompt" : "Reply";

  function open(): void {
    setFailure(undefined);
    setChoices([]);
    setIsOpen(true);
    fetchBranchChoices(chat.id, sourceId, kind).then(setChoices, (error: unknown) =>
      setFailure(error instanceof Error ? error.message : "The alternatives could not load."),
    );
  }

  async function select(targetId: string): Promise<void> {
    if (isSelecting || chat.branchBlockedReason != null) {
      return;
    }
    setIsSelecting(true);
    try {
      await selectChatBranch(chat, sourceId, targetId, kind);
      setIsOpen(false);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The branch could not change.");
    } finally {
      setIsSelecting(false);
    }
  }

  return (
    <div className={styles.switcher} data-copy="skip">
      <PlaceRow label={`${label} ${count.selected} of ${count.count}`} onOpen={open} />
      {isOpen ? (
        <Popover
          label={`${label} alternatives`}
          place="above"
          onClose={() => setIsOpen(false)}
          note="Changing branches changes saved messages. Files keep their current state."
        >
          {chat.branchBlockedReason == null ? null : (
            <p className={styles.note}>{chat.branchBlockedReason}</p>
          )}
          {failure === undefined ? null : (
            <p className={styles.note} role="status">
              {failure}
            </p>
          )}
          <MenuList
            layout="stacked"
            emptyNote="Loading alternatives."
            groups={
              choices.length === 0
                ? []
                : [
                    {
                      key: kind,
                      choices: choices.map((choice) => ({
                        key: choice.id,
                        name: choice.label,
                        detail: choice.detail,
                        isCurrent: choice.isCurrent,
                        onChoose: () => {
                          select(choice.id);
                        },
                      })),
                    },
                  ]
            }
          />
        </Popover>
      ) : null}
    </div>
  );
}
