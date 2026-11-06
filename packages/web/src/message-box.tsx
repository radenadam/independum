import type {
  AttachmentPreview,
  AttachmentSettings,
  BranchRequest,
  ChatState,
  ComposePreview,
  ContextRevision,
  ContextSummary,
  InputDelivery,
  ModelSummary,
  PendingInputsState,
  ProjectSummary,
} from "independum/api-types";
import { builtInSlashCommands } from "independum/read-context-settings";
import { type KeyboardEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { AttachmentList } from "./attachment-list.tsx";
import { changeInputDelivery, composeMessage, fetchResources, runSlashAction } from "./chat-api.ts";
import { type ChatDraft, readDraft, saveDraft } from "./chat-draft.ts";
import { ChoiceGroup } from "./choice-group.tsx";
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
import { PendingInputs } from "./pending-inputs.tsx";
import { Popover } from "./popover.tsx";
import { ProviderLogo } from "./provider-logo.tsx";
import { describeShortcut, hasShortcutModifier, shortcuts } from "./shortcut.ts";
import { StatusLabel } from "./status-label.tsx";
import { TextField } from "./text-field.tsx";
import { useAttachmentDraft } from "./use-attachment-draft.ts";
import { useTooltip } from "./use-tooltip.tsx";

/** A menu that opens from the message box. */
type Menu = "model" | "folder" | "delivery";

// The send button and the choice of delivery name what a message sent during a reply does.
const deliveryLabels: Record<InputDelivery, string> = {
  queue: "Queue after this reply",
  steer: "Steer this reply",
};

/** Properties of the message box. */
interface MessageBoxProps {
  contextVersion?: number;
  attachmentSettings?: AttachmentSettings | undefined;
  editRequest?:
    | {
        chatId: string;
        sourceUserEntryId: string;
        text: string;
        expectedLeafId: string | null;
        expectedRevision: number;
        at: number;
        imageCount: number;
        attachments?: AttachmentPreview[];
      }
    | undefined;
  onEditSend?: (request: BranchRequest) => Promise<void>;
  chatId: string | null;
  model: ChatState["model"];
  thinking: ChatState["thinking"];
  context: ContextSummary | undefined;
  models: ModelSummary[] | undefined;
  folder: string;
  projects: ProjectSummary[];
  isEmpty: boolean;
  isReplying: boolean;
  pending: PendingInputsState;
  whileReplying: InputDelivery;
  onRemovePending: (id: string) => Promise<void>;
  onResumePending: () => Promise<void>;
  onSend: (
    text: string,
    previewId: string | undefined,
    delivery: InputDelivery,
    inputId: string,
    attachmentIds: string[],
    fileAttachmentIds: string[],
  ) => Promise<void>;
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
  contextVersion,
  attachmentSettings,
  editRequest,
  onEditSend,
  chatId,
  model,
  thinking,
  context,
  models,
  folder,
  projects,
  isEmpty,
  isReplying,
  pending,
  whileReplying,
  onRemovePending,
  onResumePending,
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
  const [draft, setDraft] = useState(() => ({ chatId, ...readDraft(chatId) }));
  const [preview, setPreview] = useState<ComposePreview | undefined>();
  const [catalog, setCatalog] = useState<ContextRevision | undefined>();
  const [commandFailure, setCommandFailure] = useState<string | undefined>();
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [delivery, setDelivery] = useState(whileReplying);
  const attachmentDraft = useAttachmentDraft(
    chatId,
    `${model?.providerId}/${model?.id}/${contextVersion ?? ""}/${JSON.stringify(attachmentSettings)}`,
    attachmentSettings,
    draft.chatId === chatId ? draft.edit?.id : readDraft(chatId).edit?.id,
  );
  const picker = useRef<HTMLInputElement>(null);
  const submission = useRef<
    | {
        chatId: string;
        text: string;
        previewId: string;
        delivery: InputDelivery;
        id: string;
        attachments: string;
      }
    | undefined
  >(undefined);
  const draftVersions = useRef(new Map<string | null, number>());
  const currentChat = useRef(chatId);
  currentChat.current = chatId;
  // Each chat keeps its own draft, so opening another chat swaps the text in the field.
  if (draft.chatId !== chatId) {
    setDraft({ chatId, ...readDraft(chatId) });
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
  const isReady =
    (draft.text.trim() !== "" ||
      attachmentDraft.items.length > 0 ||
      (draft.edit?.imageCount ?? 0) > 0) &&
    attachmentDraft.isReady &&
    model !== null &&
    !isSubmitting;
  const modelName =
    model === null
      ? "Choose a model"
      : (models?.find(
          (candidate) => candidate.providerId === model.providerId && candidate.id === model.id,
        )?.name ?? model.id);
  const project = projects.find((candidate) => candidate.folder === folder);

  useEffect(() => {
    if (editRequest === undefined || editRequest.chatId !== chatId) {
      return;
    }
    const current = readDraft(chatId);
    draftVersions.current.set(chatId, (draftVersions.current.get(chatId) ?? 0) + 1);
    submission.current = undefined;
    const next: ChatDraft = {
      version: 1,
      text: editRequest.text,
      attachments: (editRequest.attachments ?? []).map(
        ({ id, name, mimeType, bytes, textBytes, kind, encoding, isFile }) => ({
          summary: { id, name, mimeType, bytes, textBytes, kind, encoding },
          isFile,
        }),
      ),
      edit: {
        id: crypto.randomUUID(),
        sourceUserEntryId: editRequest.sourceUserEntryId,
        expectedLeafId: editRequest.expectedLeafId,
        expectedRevision: editRequest.expectedRevision,
        ordinaryText: current.edit?.ordinaryText ?? current.text,
        ordinaryAttachments: current.edit?.ordinaryAttachments ?? current.attachments,
        imageCount: editRequest.imageCount,
      },
    };
    saveDraft(chatId, next);
    setDraft((current) => (current.chatId === chatId ? { chatId, ...next } : current));
    setPreview(undefined);
    setIsCommandMenuOpen(false);
    field.current?.focus();
  }, [editRequest, chatId]);

  // The field takes the cursor whenever another chat opens, when a keyboard is likely.
  useEffect(() => {
    if (chatId !== null && hasKeyboard()) {
      field.current?.focus();
    }
  }, [chatId]);
  useEffect(() => setDelivery(whileReplying), [whileReplying]);
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
    draftVersions.current.set(chatId, (draftVersions.current.get(chatId) ?? 0) + 1);
    const next = { ...draft, ...readDraft(chatId), text };
    setDraft(next);
    saveDraft(chatId, next);
  }

  function addAttachments(files: File[]): void {
    draftVersions.current.set(chatId, (draftVersions.current.get(chatId) ?? 0) + 1);
    attachmentDraft.add(files);
  }

  function finishEdit(): ChatDraft {
    draftVersions.current.set(chatId, (draftVersions.current.get(chatId) ?? 0) + 1);
    submission.current = undefined;
    const edit = readDraft(chatId).edit;
    const next: ChatDraft = {
      version: 1,
      text: edit?.ordinaryText ?? "",
      attachments: edit?.ordinaryAttachments ?? [],
      edit: null,
    };
    saveDraft(chatId, next);
    setDraft((current) => (current.chatId === chatId ? { chatId, ...next } : current));
    if (currentChat.current === chatId) {
      setCommandFailure(undefined);
    }
    return next;
  }

  async function submit(mode: InputDelivery = delivery): Promise<void> {
    const text = draft.text;
    const version = draftVersions.current.get(chatId) ?? 0;
    if (isSubmitting || chatId === null) {
      return;
    }
    setCommandFailure(undefined);
    setIsSubmitting(true);
    try {
      const attachmentIds = attachmentDraft.items.flatMap((item) =>
        item.summary === undefined ? [] : [item.summary.id],
      );
      const fileAttachmentIds = attachmentDraft.items.flatMap((item) =>
        item.isFile && item.summary !== undefined ? [item.summary.id] : [],
      );
      const attachmentIdentity = JSON.stringify([
        attachmentIds,
        fileAttachmentIds,
        draft.edit?.id,
        draft.edit === null ? null : [model, thinking?.level ?? "off"],
      ]);
      const attachmentKeys = attachmentDraft.items.map((item) => item.key);
      if (draft.edit !== null) {
        if (onEditSend === undefined || !isReady || model === null) {
          return;
        }
        const previous = submission.current;
        const inputId =
          previous?.chatId === chatId &&
          previous.text === text &&
          previous.attachments === attachmentIdentity
            ? previous.id
            : crypto.randomUUID();
        submission.current = {
          chatId,
          text,
          previewId: "",
          delivery: mode,
          id: inputId,
          attachments: attachmentIdentity,
        };
        await onEditSend({
          id: inputId,
          kind: "edit",
          sourceUserEntryId: draft.edit.sourceUserEntryId,
          expectedRevision: draft.edit.expectedRevision,
          expectedLeafId: draft.edit.expectedLeafId,
          text,
          attachmentIds,
          fileAttachmentIds,
          model: {
            providerId: model.providerId,
            modelId: model.id,
            thinkingLevel: thinking?.level ?? "off",
          },
        });
        attachmentDraft.clear(chatId, attachmentKeys);
        submission.current = undefined;
        if ((draftVersions.current.get(chatId) ?? 0) === version) {
          finishEdit();
        }
        return;
      }
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
      const submitted = preview === undefined ? composed.text : text;
      const previous = submission.current;
      const inputId =
        previous?.chatId === chatId &&
        previous.text === submitted &&
        previous.delivery === mode &&
        previous.attachments === attachmentIdentity
          ? previous.id
          : crypto.randomUUID();
      const submittedPreviewId = previous?.id === inputId ? previous.previewId : composed.id;
      submission.current = {
        chatId,
        text: submitted,
        previewId: submittedPreviewId,
        delivery: mode,
        id: inputId,
        attachments: attachmentIdentity,
      };
      await onSend(submitted, submittedPreviewId, mode, inputId, attachmentIds, fileAttachmentIds);
      attachmentDraft.clear(chatId, attachmentKeys);
      submission.current = undefined;
      if ((draftVersions.current.get(chatId) ?? 0) === version) {
        saveDraft(chatId, { ...readDraft(chatId), text: "" });
        setDraft((current) => (current.chatId === chatId ? { ...current, text: "" } : current));
        if (currentChat.current === chatId) {
          setPreview(undefined);
        }
      }
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
      !event.altKey &&
      (hasKeyboard() || hasShortcutModifier(event))
    ) {
      event.preventDefault();
      submit(
        hasShortcutModifier(event) && isReplying
          ? delivery === "queue"
            ? "steer"
            : "queue"
          : delivery,
      );
    } else if (event.key === "Escape" && (menu !== undefined || isCommandMenuOpen)) {
      event.preventDefault();
      setMenu(undefined);
      setIsCommandMenuOpen(false);
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
        <fieldset
          className={styles.box}
          aria-label="Message box"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files")) {
              event.preventDefault();
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            const entries = [...event.dataTransfer.items];
            if (entries.some((item) => item.webkitGetAsEntry?.()?.isDirectory)) {
              setCommandFailure("Folders cannot be attached. Choose files instead.");
              return;
            }
            addAttachments([...event.dataTransfer.files]);
          }}
          onPaste={(event) => {
            const files = [...event.clipboardData.files];
            if (files.length > 0) {
              event.preventDefault();
              addAttachments(files);
              const plain = event.clipboardData.getData("text/plain");
              if (plain !== "") {
                const start = field.current?.selectionStart ?? draft.text.length;
                const end = field.current?.selectionEnd ?? start;
                changeDraft(draft.text.slice(0, start) + plain + draft.text.slice(end));
              }
            }
          }}
        >
          <PendingInputs
            chatId={chatId}
            pending={pending}
            onRemove={onRemovePending}
            onResume={onResumePending}
          />
          {chatId === null ? null : (
            <AttachmentList
              chatId={chatId}
              items={attachmentDraft.items}
              onRemove={(key) => {
                draftVersions.current.set(chatId, (draftVersions.current.get(chatId) ?? 0) + 1);
                attachmentDraft.remove(key);
              }}
              onChooseFile={(key, isFile) => {
                draftVersions.current.set(chatId, (draftVersions.current.get(chatId) ?? 0) + 1);
                attachmentDraft.chooseFile(key, isFile);
              }}
            />
          )}
          {attachmentDraft.error === undefined ? null : (
            <p className={styles.commandNotice}>{attachmentDraft.error}</p>
          )}
          {draft.edit === null ? null : (
            <div className={styles.editing}>
              <p>Editing this prompt creates another branch.</p>
              <IconButton
                icon="close"
                label="Cancel edit"
                onClick={() => {
                  finishEdit();
                }}
              />
            </div>
          )}
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
                draft.edit === null &&
                  preview === undefined &&
                  event.target.value.startsWith("/") &&
                  !event.target.value.startsWith("//"),
              );
            }}
            onKeyDown={onFieldKey}
          />
          <div className={styles.tools}>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              aria-label="Attachment files"
              onChange={(event) => {
                addAttachments([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
            <IconButton
              icon="add"
              label="Add attachment"
              tipSide="above"
              onClick={() => picker.current?.click()}
            />
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
            <span className={styles.anchor}>
              <IconButton
                icon="menu"
                label="Choose queue or steer"
                tipSide="above"
                isExpanded={menu === "delivery"}
                onClick={() => toggleMenu("delivery")}
              />
              {menu !== "delivery" ? null : (
                <Popover
                  label="Queue or steer"
                  place={isEmpty ? "below" : "above"}
                  onClose={() => setMenu(undefined)}
                >
                  <ChoiceGroup
                    label="Send during a reply"
                    choices={[
                      { value: "queue", label: deliveryLabels.queue },
                      { value: "steer", label: deliveryLabels.steer },
                    ]}
                    current={delivery}
                    onChoose={(mode) => {
                      changeInputDelivery(mode).then(
                        () => setDelivery(mode),
                        (error: unknown) =>
                          setCommandFailure(
                            error instanceof Error
                              ? error.message
                              : "The delivery mode could not be saved.",
                          ),
                      );
                    }}
                  />
                  <p className={styles.commandNotice}>
                    Queue after this reply sends a message once the agent finishes its current work.
                  </p>
                  <p className={styles.commandNotice}>
                    Steer this reply sends it to the model when its current tool calls finish,
                    before it writes again.
                  </p>
                  <p className={styles.commandNotice}>
                    {hasKeyboard()
                      ? `Enter and the send button use the chosen one. ${describeShortcut(shortcuts.otherDelivery)} uses the other one.`
                      : "The send button uses the chosen one."}
                  </p>
                </Popover>
              )}
            </span>
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
            ) : null}
            <IconButton
              icon="send"
              label={isReplying ? deliveryLabels[delivery] : "Send"}
              keyName="Enter"
              tipSide="above"
              tipAlign="end"
              isRound
              isFilled={isReady}
              onClick={() => submit()}
            />
          </div>
        </fieldset>
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
