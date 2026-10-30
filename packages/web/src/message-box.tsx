import type { ChatState, ContextSummary, ModelSummary, ProjectSummary } from "independum/api-types";
import { type KeyboardEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { readDraft, saveDraft } from "./chat-draft.ts";
import { ContextMeter } from "./context-meter.tsx";
import { describeThinking } from "./describe-thinking.ts";
import { FolderMenu } from "./folder-menu.tsx";
import { hasKeyboard } from "./has-keyboard.ts";
import { Icon } from "./icon.tsx";
import { IconButton } from "./icon-button.tsx";
import styles from "./message-box.module.css";
import { ModelMenu } from "./model-menu.tsx";
import { OneLineTitle } from "./one-line-title.tsx";
import { Popover } from "./popover.tsx";
import { ProviderLogo } from "./provider-logo.tsx";
import { StatusLabel } from "./status-label.tsx";
import { useTooltip } from "./use-tooltip.tsx";

/** A menu that opens from the message box. */
type Menu = "model" | "folder";

/** Properties of the message box. */
interface MessageBoxProps {
  chatId: string | null;
  model: ChatState["model"];
  thinking: ChatState["thinking"];
  context: ContextSummary | undefined;
  models: ModelSummary[] | undefined;
  folder: string;
  projects: ProjectSummary[];
  isEmpty: boolean;
  isReplying: boolean;
  onSend: (text: string) => Promise<void>;
  onStop: () => void;
  onOpenModels: () => void;
  onChooseModel: (model: ModelSummary) => void;
  onChooseThinking: (level: string) => void;
  onChooseFolder: (folder: string) => void;
  onManageLogins: () => void;
  onOpenContext: () => void;
  runningCount: number;
  onOpenCommands: () => void;
}

/**
 * Draws the field for a message with the model, send, and stop buttons, and the chat's folder
 * under it, which a new chat can change.
 */
export function MessageBox({
  chatId,
  model,
  thinking,
  context,
  models,
  folder,
  projects,
  isEmpty,
  isReplying,
  onSend,
  onStop,
  onOpenModels,
  onChooseModel,
  onChooseThinking,
  onChooseFolder,
  onManageLogins,
  onOpenContext,
  runningCount,
  onOpenCommands,
}: MessageBoxProps): ReactElement {
  const [draft, setDraft] = useState(() => readDraft(chatId));
  const [draftChatId, setDraftChatId] = useState(chatId);
  // Each chat keeps its own draft, so opening another chat swaps the text in the field.
  if (draftChatId !== chatId) {
    setDraftChatId(chatId);
    setDraft(readDraft(chatId));
  }
  const [menu, setMenu] = useState<Menu | undefined>();
  const modelTip = useTooltip(
    menu === "model" ? undefined : "Choose a model and its thinking effort",
  );
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

  function toggleMenu(next: Menu): void {
    if (next === "model" && menu !== "model") {
      onOpenModels();
    }
    setMenu((current) => (current === next ? undefined : next));
  }

  function changeDraft(text: string): void {
    setDraft(text);
    saveDraft(chatId, text);
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
    changeDraft("");
    onSend(text).catch(() => changeDraft(text));
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
            onChange={(event) => changeDraft(event.target.value)}
            onKeyDown={onFieldKey}
          />
          <div className={styles.tools}>
            <span className={styles.anchor}>
              <button
                type="button"
                className={styles.pill}
                aria-expanded={menu === "model"}
                onClick={() => toggleMenu("model")}
                {...modelTip.handlers}
              >
                {model === null ? null : <ProviderLogo providerId={model.providerId} size={15} />}
                <OneLineTitle text={modelName} />
                {thinking === null ? null : (
                  <span className={styles.effort}>{describeThinking(thinking.level)}</span>
                )}
                <Icon name="menu" size={14} />
                {modelTip.tooltip}
              </button>
              {menu === "model" ? (
                <Popover
                  label="Choose a model"
                  place={isEmpty ? "below" : "above"}
                  onClose={() => setMenu(undefined)}
                >
                  <ModelMenu
                    models={models}
                    current={model}
                    thinking={thinking}
                    onChooseThinking={onChooseThinking}
                    onChoose={onChooseModel}
                    onManageLogins={onManageLogins}
                  />
                </Popover>
              ) : null}
            </span>
            <span className={styles.space} />
            <ContextMeter context={context} onOpen={onOpenContext} />
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
                aria-expanded={menu === "folder"}
                onClick={() => toggleMenu("folder")}
              >
                <Icon name="folder" size={14} />
                <OneLineTitle text={project?.name ?? folder} tooltip={folder} />
                <Icon name="menu" size={13} />
              </button>
              {menu === "folder" ? (
                <Popover
                  label="Choose the folder"
                  place="below"
                  note="Opening another folder comes later."
                  onClose={() => setMenu(undefined)}
                >
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
            <span className={`${styles.pill} ${styles.folder} ${styles.still}`}>
              <Icon name="folder" size={14} />
              <OneLineTitle text={project?.name ?? folder} tooltip={folder} />
            </span>
          )}
          {runningCount === 0 ? null : (
            <button
              type="button"
              className={`${styles.pill} ${styles.running}`}
              onClick={onOpenCommands}
            >
              <StatusLabel
                status={{
                  text:
                    runningCount === 1 ? "1 command running" : `${runningCount} commands running`,
                  tone: "running",
                }}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
