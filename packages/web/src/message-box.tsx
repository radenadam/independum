import type { ChatState, ModelSummary, ProjectSummary } from "independum/api-types";
import { type KeyboardEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { FolderMenu } from "./folder-menu.tsx";
import { hasKeyboard } from "./has-keyboard.ts";
import { Icon } from "./icon.tsx";
import { IconButton } from "./icon-button.tsx";
import styles from "./message-box.module.css";
import { ModelMenu } from "./model-menu.tsx";
import { Popover } from "./popover.tsx";
import { ProviderLogo } from "./provider-logo.tsx";

/** Properties of the message box. */
interface MessageBoxProps {
  chatId: string | null;
  model: ChatState["model"];
  models: ModelSummary[] | undefined;
  folder: string;
  projects: ProjectSummary[];
  isEmpty: boolean;
  isReplying: boolean;
  onSend: (text: string) => Promise<void>;
  onStop: () => void;
  onOpenModels: () => void;
  onChooseModel: (model: ModelSummary) => void;
  onChooseFolder: (folder: string) => void;
  onManageLogins: () => void;
}

/**
 * Draws the field for a message with the model, send, and stop buttons, and the chat's folder
 * under it, which a new chat can change.
 */
export function MessageBox({
  chatId,
  model,
  models,
  folder,
  projects,
  isEmpty,
  isReplying,
  onSend,
  onStop,
  onOpenModels,
  onChooseModel,
  onChooseFolder,
  onManageLogins,
}: MessageBoxProps): ReactElement {
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<"model" | "folder" | undefined>();
  const field = useRef<HTMLTextAreaElement>(null);
  const isReady = draft.trim() !== "" && model !== null && !isReplying;
  const modelName =
    model === null
      ? "Choose a model"
      : (models?.find(
          (candidate) => candidate.providerId === model.providerId && candidate.id === model.id,
        )?.name ?? model.id);
  const project = projects.find((candidate) => candidate.folder === folder);

  // The field takes the cursor whenever another chat opens, when a keyboard is likely.
  useEffect(() => {
    if (chatId !== null && hasKeyboard()) {
      field.current?.focus();
    }
  }, [chatId]);

  function toggleMenu(next: "model" | "folder"): void {
    if (next === "model" && menu !== "model") {
      onOpenModels();
    }
    setMenu((current) => (current === next ? undefined : next));
  }

  function submit(): void {
    const text = draft.trim();
    if (model === null) {
      toggleMenu("model");
      return;
    }
    if (!isReady) {
      return;
    }
    setDraft("");
    onSend(text).catch(() => setDraft(text));
  }

  function onFieldKey(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      hasKeyboard()
    ) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && isReplying) {
      event.preventDefault();
      onStop();
    }
  }

  return (
    <div className={styles.area}>
      <div className={styles.frame}>
        <div className={styles.box}>
          <textarea
            ref={field}
            className={styles.field}
            aria-label="Message"
            rows={2}
            placeholder="Write a message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onFieldKey}
          />
          <div className={styles.tools}>
            <span className={styles.anchor}>
              <button
                type="button"
                className={styles.pill}
                aria-expanded={menu === "model"}
                onClick={() => toggleMenu("model")}
              >
                {model === null ? null : <ProviderLogo providerId={model.providerId} size={15} />}
                {modelName}
                <Icon name="menu" size={14} />
              </button>
              {menu === "model" ? (
                <Popover
                  label="Choose a model"
                  side={isEmpty ? "below" : "above"}
                  onClose={() => setMenu(undefined)}
                >
                  <ModelMenu
                    models={models}
                    current={model}
                    onChoose={(chosen) => {
                      setMenu(undefined);
                      onChooseModel(chosen);
                    }}
                    onManageLogins={onManageLogins}
                  />
                </Popover>
              ) : null}
            </span>
            <span className={styles.space} />
            {isReplying ? (
              <IconButton
                icon="stop"
                label="Stop"
                keyName="Esc"
                tipSide="above"
                tipAlign="end"
                isRound
                isFilled
                onClick={onStop}
              />
            ) : (
              <IconButton
                icon="send"
                label="Send"
                keyName="Enter"
                tipSide="above"
                tipAlign="end"
                isRound
                isFilled={isReady}
                onClick={submit}
              />
            )}
          </div>
        </div>
        <div className={styles.under}>
          {isEmpty ? (
            <span className={styles.anchor}>
              <button
                type="button"
                className={`${styles.pill} ${styles.folder}`}
                title={folder}
                aria-expanded={menu === "folder"}
                onClick={() => toggleMenu("folder")}
              >
                <Icon name="folder" size={14} />
                {project?.name ?? folder}
                <Icon name="menu" size={13} />
              </button>
              {menu === "folder" ? (
                <Popover label="Choose the folder" side="below" onClose={() => setMenu(undefined)}>
                  <FolderMenu
                    projects={projects}
                    folder={folder}
                    onChoose={(chosen) => {
                      setMenu(undefined);
                      onChooseFolder(chosen);
                    }}
                  />
                </Popover>
              ) : null}
            </span>
          ) : (
            <span className={`${styles.pill} ${styles.folder} ${styles.still}`} title={folder}>
              <Icon name="folder" size={14} />
              {project?.name ?? folder}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
