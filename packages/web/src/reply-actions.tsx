import type { ChatMessage, ChatState, InputModel, ModelSummary } from "independum/api-types";
import { type ReactElement, useRef, useState } from "react";
import { resubmitMessage } from "./chat-api.ts";
import { Icon } from "./icon.tsx";
import { IconButton } from "./icon-button.tsx";
import { ModalDialog } from "./modal-dialog.tsx";
import { ModelMenu } from "./model-menu.tsx";
import { Popover } from "./popover.tsx";
import styles from "./reply-actions.module.css";
import { RowButton } from "./row-button.tsx";
import { TextButton } from "./text-button.tsx";

/** Properties of the actions for one complete reply. */
interface ReplyActionsProps {
  chat: ChatState;
  sourceId: string;
  first: ChatMessage;
  models: ModelSummary[] | undefined;
  onOpenModels: () => void;
  onManageLogins: () => void;
}

/** Retries a saved prompt with its original choice or a locally selected model and effort. */
export function ReplyActions({
  chat,
  sourceId,
  first,
  models,
  onOpenModels,
  onManageLogins,
}: ReplyActionsProps): ReactElement {
  const [menu, setMenu] = useState<"actions" | "model" | undefined>();
  const [choice, setChoice] = useState<InputModel | null>(first.attempt ?? null);
  const [failure, setFailure] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputId = useRef(crypto.randomUUID());
  const selected = models?.find(
    (model) => model.providerId === choice?.providerId && model.id === choice.modelId,
  );
  const levels = selected?.thinkingLevels ?? [];

  function openPicker(): void {
    onOpenModels();
    setMenu("model");
  }

  async function retry(model: InputModel | null): Promise<void> {
    if (isSubmitting || chat.branchBlockedReason != null || first.entryId === undefined) {
      return;
    }
    if (
      menu === "model" &&
      (model === null || model.thinkingLevel === null || selected === undefined)
    ) {
      setFailure("Choose an available model and its effort before retrying.");
      return;
    }
    setIsSubmitting(true);
    try {
      await resubmitMessage(chat.id, {
        id: inputId.current,
        kind: "retry",
        sourceUserEntryId: sourceId,
        sourceAssistantEntryId: first.entryId,
        expectedRevision: chat.pending.revision,
        expectedLeafId: chat.leafId,
        model,
      });
      inputId.current = crypto.randomUUID();
      setMenu(undefined);
      setFailure(undefined);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The retry could not start.");
      openPicker();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <span className={styles.anchor}>
      <IconButton
        icon="more"
        label="Reply actions"
        isExpanded={menu === "actions"}
        onClick={() => {
          setFailure(undefined);
          setMenu(menu === "actions" ? undefined : "actions");
        }}
      />
      {menu === "actions" ? (
        <Popover
          label="Reply actions"
          place="above"
          onClose={() => setMenu(undefined)}
          note="Uses current agent settings."
        >
          {chat.branchBlockedReason == null ? null : (
            <p className={styles.note}>{chat.branchBlockedReason}</p>
          )}
          <RowButton
            label="Retry"
            leading={<Icon name="reset" size={16} />}
            onClick={() => {
              retry(null);
            }}
          />
          <RowButton
            label="Retry with another model or effort"
            leading={<Icon name="agent" size={16} />}
            onClick={openPicker}
          />
        </Popover>
      ) : null}
      <ModalDialog
        isOpen={menu === "model"}
        label="Retry with another model or effort"
        className={styles.dialog}
        isFullOnPhone
        onClose={() => setMenu(undefined)}
      >
        <div className={styles.heading}>
          <h2>Retry with another model or effort</h2>
          <IconButton icon="close" label="Cancel retry" onClick={() => setMenu(undefined)} />
        </div>
        <p className={styles.note}>Uses current agent settings.</p>
        {chat.branchBlockedReason == null ? null : (
          <p className={styles.note}>{chat.branchBlockedReason}</p>
        )}
        {failure === undefined ? null : (
          <p className={styles.note} role="status">
            {failure}
          </p>
        )}
        <ModelMenu
          models={models}
          current={choice === null ? null : { providerId: choice.providerId, id: choice.modelId }}
          thinking={
            levels.length < 2
              ? null
              : { level: choice?.thinkingLevel ?? levels[0] ?? "off", levels }
          }
          onChoose={(model) => {
            const available = model.thinkingLevels ?? [];
            setChoice({
              providerId: model.providerId,
              modelId: model.id,
              thinkingLevel: available.includes(choice?.thinkingLevel ?? "")
                ? (choice?.thinkingLevel ?? "off")
                : (available[0] ?? "off"),
            });
          }}
          onChooseThinking={async (level) => {
            setChoice((current) =>
              current === null ? null : { ...current, thinkingLevel: level },
            );
          }}
          onManageLogins={onManageLogins}
        />
        <div className={styles.buttons}>
          <TextButton
            label={isSubmitting ? "Starting retry" : "Retry"}
            onClick={() => {
              retry(choice);
            }}
            isPrimary
          />
        </div>
      </ModalDialog>
    </span>
  );
}
