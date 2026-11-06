import type { AttachmentPreview } from "independum/api-types";
import { type ReactElement, useEffect, useState } from "react";
import { attachmentUrl } from "./attachment-api.ts";
import styles from "./attachment-list.module.css";
import { CodeWell } from "./code-well.tsx";
import { IconButton } from "./icon-button.tsx";
import { ModalDialog } from "./modal-dialog.tsx";
import { PlaceFrame, PlaceNote } from "./place-frame.tsx";
import { PlaceRow } from "./place-row.tsx";
import { PlaceSection } from "./place-section.tsx";
import { ToggleSwitch } from "./toggle-switch.tsx";
import type { DraftAttachment } from "./use-attachment-draft.ts";

/** Draws attachment delivery tiles and opens the exact original and prepared input. */
export function AttachmentList({
  chatId,
  items,
  onRemove,
  onChooseFile,
}: {
  chatId: string;
  items: DraftAttachment[];
  onRemove?: (key: string) => void;
  onChooseFile?: (key: string, isFile: boolean) => void;
}): ReactElement | null {
  const [opened, setOpened] = useState<string>();
  const item = items.find((entry) => entry.key === opened);
  if (items.length === 0) {
    return null;
  }
  return (
    <div className={styles.list} data-copy="skip">
      {items.map((entry) => {
        const form =
          entry.summary === undefined
            ? "Uploading"
            : entry.isFile || entry.summary.kind === "file"
              ? entry.preview?.modelText === ""
                ? "No model input"
                : "File path included"
              : entry.summary.kind === "text"
                ? "Text included"
                : "Image";
        return (
          <div className={styles.entry} key={entry.key}>
            <div className={styles.tile}>
              <PlaceRow
                label={entry.name}
                glance={entry.error ?? entry.preview?.error ?? form}
                icon={
                  entry.summary?.kind === "image" ? (
                    <AttachmentImage
                      chatId={chatId}
                      id={entry.summary.id}
                      name={entry.name}
                      isThumbnail
                    />
                  ) : undefined
                }
                onOpen={() => setOpened(entry.key)}
              />
              {entry.preview?.notice ? (
                <p className={styles.notice}>{entry.preview.notice}</p>
              ) : null}
            </div>
            {onRemove === undefined ? null : (
              <IconButton
                icon="close"
                label={`Remove attachment ${entry.name}`}
                onClick={() => onRemove(entry.key)}
              />
            )}
          </div>
        );
      })}
      {item === undefined ? null : (
        <ModalDialog
          isOpen
          label="Attachment"
          className={styles.dialog}
          isFullOnPhone
          onClose={() => setOpened(undefined)}
        >
          <div className={styles.header}>
            <h2>Attachment</h2>
            <IconButton
              icon="close"
              label="Close attachment"
              onClick={() => setOpened(undefined)}
            />
          </div>
          <div className={styles.body}>
            <PlaceFrame>
              <PlaceSection heading="Original">
                <p className={styles.name}>{item.name}</p>
                {item.summary === undefined ? (
                  <PlaceNote>{item.error ?? "Uploading."}</PlaceNote>
                ) : (
                  <>
                    <PlaceNote>
                      {item.summary.mimeType}. {item.summary.bytes} bytes.
                    </PlaceNote>
                    {item.summary.kind === "image" ? (
                      <AttachmentImage chatId={chatId} id={item.summary.id} name={item.name} />
                    ) : null}
                    {item.summary.kind === "text" && item.preview?.text !== undefined ? (
                      <CodeWell code={item.preview.text} copyLabel="Copy attachment text" />
                    ) : null}
                  </>
                )}
              </PlaceSection>
              {onChooseFile === undefined || item.summary?.kind !== "text" ? null : (
                <ToggleSwitch
                  label="Include file path"
                  isOn={item.isFile}
                  onChange={(isFile) => onChooseFile(item.key, isFile)}
                />
              )}
              <PlaceSection heading="Model input">
                {(item.error ?? item.preview?.error) ? (
                  <PlaceNote>{item.error ?? item.preview?.error}</PlaceNote>
                ) : null}
                {item.preview === undefined ? (
                  <PlaceNote>
                    {onChooseFile === undefined
                      ? "Prepared when this waiting message sends."
                      : "Preparing the input."}
                  </PlaceNote>
                ) : (
                  <PreparedInput preview={item.preview} />
                )}
              </PlaceSection>
            </PlaceFrame>
          </div>
        </ModalDialog>
      )}
    </div>
  );
}

function PreparedInput({ preview }: { preview: AttachmentPreview }): ReactElement {
  return (
    <>
      {preview.notice === null ? null : <PlaceNote>{preview.notice}</PlaceNote>}
      {preview.modelText === "" ? (
        <PlaceNote>No attachment text is included.</PlaceNote>
      ) : (
        <CodeWell code={preview.modelText} copyLabel="Copy attachment model input" />
      )}
      {preview.image === null ? null : (
        <img
          className={styles.image}
          src={`data:${preview.image.mimeType};base64,${preview.image.data}`}
          alt={`Prepared ${preview.name}`}
        />
      )}
    </>
  );
}

function AttachmentImage({
  chatId,
  id,
  name,
  isThumbnail = false,
}: {
  chatId: string;
  id: string;
  name: string;
  isThumbnail?: boolean;
}): ReactElement | null {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let isCurrent = true;
    let original: string | undefined;
    setUrl(undefined);
    attachmentUrl(chatId, id).then(
      (next) => {
        original = next;
        if (isCurrent) {
          setUrl(next);
        } else {
          URL.revokeObjectURL(next);
        }
      },
      () => undefined,
    );
    return () => {
      isCurrent = false;
      if (original !== undefined) {
        URL.revokeObjectURL(original);
      }
    };
  }, [chatId, id]);
  return url === undefined ? null : (
    <img
      className={isThumbnail ? styles.thumbnail : styles.image}
      src={url}
      alt={isThumbnail ? "" : `Original ${name}`}
    />
  );
}
