import type {
  ChatState,
  ComposePreview,
  ContextRevision,
  ContextSummary,
  ModelSummary,
  ProjectSummary,
} from "independum/api-types";
import { builtInSlashCommands } from "independum/read-context-settings";
import { type KeyboardEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { composeMessage, fetchResources, runSlashAction } from "./chat-api.ts";
import { readDraft, saveDraft } from "./chat-draft.ts";
import { CommandPreview } from "./command-preview.tsx";
import { ContextMeter } from "./context-meter.tsx";
import { describeThinking } from "./describe-thinking.ts";
import { FolderMenu } from "./folder-menu.tsx";
import { hasKeyboard } from "./has-keyboard.ts";
import { Icon } from "./icon.tsx";
import { IconButton } from "./icon-button.tsx";
import { MenuList } from "./menu-list.tsx";
import styles from "./message-box.module.css";
import { ModelMenu } from "./model-menu.tsx";
import { OneLineTitle } from "./one-line-title.tsx";
import { Popover } from "./popover.tsx";
import { ProviderLogo } from "./provider-logo.tsx";
import { StatusLabel } from "./status-label.tsx";
import { TextField } from "./text-field.tsx";
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
  onSend: (text: string, previewId?: string) => Promise<void>;
  onSlashAction: (action: string, argumentsText: string, newChatId?: string) => void;
  onStop: () => void;
  onOpenModels: () => void;
  onChooseModel: (model: ModelSummary) => void;
  onChooseThinking: (level: string) => Promise<void>;
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
  onSlashAction,
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
  const [draft, setDraft] = useState(() => ({ chatId, text: readDraft(chatId) }));
  const [preview, setPreview] = useState<ComposePreview | undefined>();
  const [catalog, setCatalog] = useState<ContextRevision | undefined>();
  const [commandFailure, setCommandFailure] = useState<string | undefined>();
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Each chat keeps its own draft, so opening another chat swaps the text in the field.
  if (draft.chatId !== chatId) {
    setDraft({ chatId, text: readDraft(chatId) });
    setPreview(undefined);
    setIsCommandMenuOpen(false);
    setCatalog(undefined);
    setCommandFailure(undefined);
  }
  const [menu, setMenu] = useState<Menu | undefined>();
  const modelTip = useTooltip(
    menu === "model" ? undefined : "Choose a model and its thinking effort",
  );
  const field = useRef<HTMLTextAreaElement>(null);
  const isReady = draft.text.trim() !== "" && model !== null && !isReplying;
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
  useEffect(() => {
    if (chatId === null || (context !== undefined && context.chatId !== chatId)) {
      return;
    }
    let isCurrent = true;
    fetchResources(chatId).then(
      (resources) => {
        if (isCurrent) {
          setCatalog(resources);
        }
      },
      () => undefined,
    );
    return () => {
      isCurrent = false;
    };
  }, [chatId, context]);

  function toggleMenu(next: Menu): void {
    if (next === "model" && menu !== "model") {
      onOpenModels();
    }
    setMenu((current) => (current === next ? undefined : next));
  }

  function changeDraft(text: string): void {
    setDraft({ chatId, text });
    saveDraft(chatId, text);
  }

  async function submit(): Promise<void> {
    const text = draft.text;
    if (isSubmitting || chatId === null) {
      return;
    }
    setCommandFailure(undefined);
    setIsSubmitting(true);
    try {
      const composed = preview?.chatId === chatId ? preview : await composeMessage(chatId, text);
      if (composed.kind === "action") {
        const result = await runSlashAction(chatId, composed.id);
        if (result.action === "help") {
          setIsCommandMenuOpen(true);
        }
        if (
          (result.action === "model" && result.arguments === "") ||
          (result.action === "thinking" && result.arguments === "")
        ) {
          toggleMenu("model");
        }
        onSlashAction(result.action, result.arguments, result.chatId);
        changeDraft("");
        setPreview(undefined);
        return;
      }
      if (composed.kind === "preview" && preview === undefined) {
        setPreview(composed);
        changeDraft(composed.text);
        setIsCommandMenuOpen(false);
        return;
      }
      if (model === null) {
        toggleMenu("model");
        return;
      }
      if (!isReady) {
        return;
      }
      changeDraft("");
      await onSend(preview === undefined ? composed.text : text, composed.id).catch(
        (error: unknown) => {
          saveDraft(chatId, text);
          setDraft((current) => (current.chatId === chatId ? { chatId, text } : current));
          throw error;
        },
      );
      setPreview(undefined);
    } catch (error) {
      setCommandFailure(
        error instanceof Error ? error.message : "The command cannot be submitted.",
      );
    } finally {
      setIsSubmitting(false);
    }
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
        {preview?.chatId !== chatId ? null : (
          <CommandPreview
            preview={preview}
            isEdited={preview.text !== draft.text}
            onRestore={() => {
              changeDraft(preview.invocation);
              setPreview(undefined);
            }}
          />
        )}
        {commandFailure === undefined ? null : (
          <p className={styles.commandNotice}>{commandFailure}</p>
        )}
        {isCommandMenuOpen && catalog?.settings.slashCommands.isEnabled ? (
          <Popover
            label="Slash commands"
            place={isEmpty ? "below" : "above"}
            onClose={() => setIsCommandMenuOpen(false)}
          >
            <TextField
              id="slash-command-search"
              label="Search slash commands"
              kind="search"
              value={draft.text}
              onChange={changeDraft}
              isFocusedFirst
            />
            <MenuList
              layout="stacked"
              emptyNote="No matching commands."
              groups={[
                {
                  key: "commands",
                  choices: [
                    ...builtInSlashCommands.map((command) => ({
                      name: `/${command.name}`,
                      detail: `${command.argumentHint} ${command.description} Independum`,
                    })),
                    ...catalog.resources
                      .filter(
                        (resource) =>
                          resource.state === "enabled" && resource.kind !== "instructions",
                      )
                      .map((resource) => ({
                        name: `/${resource.kind === "skill" ? "skill:" : ""}${resource.name}`,
                        detail: `${typeof resource.metadata["argument-hint"] === "string" ? resource.metadata["argument-hint"] : ""} ${resource.description} ${resource.scope}`,
                      })),
                  ]
                    .filter((choice) =>
                      `${choice.name} ${choice.detail}`
                        .toLowerCase()
                        .includes(
                          (draft.text.split(/\s/)[0] ?? "").replace(/^\//, "").toLowerCase(),
                        ),
                    )
                    .map((choice) => ({
                      ...choice,
                      key: choice.name,
                      isCurrent: false,
                      onChoose: () => {
                        changeDraft(choice.name);
                        setPreview(undefined);
                        setIsCommandMenuOpen(false);
                        composeMessage(chatId ?? "", choice.name).then(
                          (composed) => {
                            if (composed.kind === "preview") {
                              setPreview(composed);
                              changeDraft(composed.text);
                            }
                          },
                          (error: unknown) =>
                            setCommandFailure(
                              error instanceof Error ? error.message : "The command cannot expand.",
                            ),
                        );
                      },
                    })),
                },
              ]}
            />
          </Popover>
        ) : null}
        <div className={styles.box}>
          <textarea
            ref={field}
            className={styles.field}
            aria-label="Message"
            rows={2}
            placeholder="Write a message"
            value={draft.text}
            onChange={(event) => {
              changeDraft(event.target.value);
              setIsCommandMenuOpen(
                preview === undefined &&
                  event.target.value.startsWith("/") &&
                  !event.target.value.startsWith("//"),
              );
            }}
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
