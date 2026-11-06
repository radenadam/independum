import type {
  AttachmentPreview,
  AttachmentSettings,
  AttachmentSummary,
} from "independum/api-types";
import { useCallback, useEffect, useState } from "react";
import { previewAttachment, uploadAttachment } from "./attachment-api.ts";
import { readDraftAttachments, saveDraftAttachments } from "./chat-draft.ts";

/** A local attachment tile, including upload failures that keep the draft unsent. */
export interface DraftAttachment {
  preparation?: string | undefined;
  key: string;
  name: string;
  isFile: boolean;
  summary?: AttachmentSummary;
  preview?: AttachmentPreview | undefined;
  error?: string | undefined;
}

/** Local attachment sources and the actions used by every composer input path. */
interface AttachmentDraft {
  items: DraftAttachment[];
  isReady: boolean;
  error: string | undefined;
  add(files: File[]): void;
  remove(key: string): void;
  chooseFile(key: string, isFile: boolean): void;
  clear(chatId: string, keys: string[]): void;
}

/** Keeps only source references in local storage and refreshes prepared previews on settings changes. */
export function useAttachmentDraft(
  chatId: string | null,
  preparation: string,
  settings: AttachmentSettings | undefined,
): AttachmentDraft {
  const [drafts, setDrafts] = useState<Record<string, DraftAttachment[]>>({});
  const items = chatId === null ? [] : (drafts[chatId] ?? readAttachments(chatId));
  const requests = JSON.stringify(
    items.flatMap((item) =>
      item.summary === undefined
        ? []
        : [{ key: item.key, id: item.summary.id, isFile: item.isFile }],
    ),
  );

  const update = useCallback(
    (id: string, change: (current: DraftAttachment[]) => DraftAttachment[]): void => {
      setDrafts((current) => {
        const next = change(current[id] ?? readAttachments(id));
        const retained = next.flatMap((item) =>
          item.summary === undefined ? [] : [{ summary: item.summary, isFile: item.isFile }],
        );
        saveDraftAttachments(id, retained);
        return { ...current, [id]: next };
      });
    },
    [],
  );

  useEffect(() => {
    if (chatId === null) {
      return;
    }
    let isCurrent = true;
    for (const item of JSON.parse(requests) as { key: string; id: string; isFile: boolean }[]) {
      update(chatId, (current) =>
        current.map((entry) =>
          entry.key === item.key ? { ...entry, preview: undefined, error: undefined } : entry,
        ),
      );
      previewAttachment(chatId, item.id, item.isFile).then(
        (preview) => {
          if (isCurrent) {
            update(chatId, (current) =>
              current.map((entry) =>
                entry.key === item.key ? { ...entry, preview, preparation } : entry,
              ),
            );
          }
        },
        (error: unknown) => {
          if (isCurrent) {
            update(chatId, (current) =>
              current.map((entry) =>
                entry.key === item.key
                  ? {
                      ...entry,
                      error:
                        error instanceof Error
                          ? error.message
                          : "The attachment cannot be prepared.",
                    }
                  : entry,
              ),
            );
          }
        },
      );
    }
    return () => {
      isCurrent = false;
    };
  }, [chatId, preparation, requests, update]);

  const summaries = items.flatMap((item) => (item.summary === undefined ? [] : [item.summary]));
  const inlineBytes = items.reduce(
    (total, item) => total + (item.isFile ? 0 : (item.summary?.textBytes ?? 0)),
    0,
  );
  const error =
    settings === undefined
      ? undefined
      : items.length > settings.maxCount
        ? `At most ${settings.maxCount} attachments fit in one prompt.`
        : summaries.reduce((total, item) => total + item.bytes, 0) > settings.maxTotalBytes
          ? `The attachments exceed the ${settings.maxTotalBytes} byte total limit.`
          : inlineBytes > settings.maxTotalTextBytes
            ? `The inline text exceeds the ${settings.maxTotalTextBytes} byte total limit.`
            : undefined;
  return {
    items,
    error,
    isReady:
      error === undefined &&
      items.every(
        (item) =>
          item.preview !== undefined &&
          item.preview.error === null &&
          item.error === undefined &&
          item.preparation === preparation,
      ),
    add(files) {
      if (chatId === null) {
        return;
      }
      for (const file of files) {
        const key = crypto.randomUUID();
        update(chatId, (current) => [...current, { key, name: file.name, isFile: false }]);
        uploadAttachment(chatId, file).then(
          (summary) =>
            update(chatId, (current) =>
              current.map((item) => (item.key === key ? { ...item, summary } : item)),
            ),
          (error: unknown) =>
            update(chatId, (current) =>
              current.map((item) =>
                item.key === key
                  ? {
                      ...item,
                      error:
                        error instanceof Error
                          ? error.message
                          : "The attachment could not be uploaded.",
                    }
                  : item,
              ),
            ),
        );
      }
    },
    remove(key) {
      if (chatId !== null) {
        update(chatId, (current) => current.filter((item) => item.key !== key));
      }
    },
    chooseFile(key, isFile) {
      if (chatId !== null) {
        update(chatId, (current) =>
          current.map((item) => (item.key === key ? { ...item, isFile } : item)),
        );
      }
    },
    clear(id, keys) {
      update(id, (current) => current.filter((item) => !keys.includes(item.key)));
    },
  };
}

function readAttachments(chatId: string): DraftAttachment[] {
  return readDraftAttachments(chatId).map(({ summary, isFile }) => ({
    key: summary.id,
    name: summary.name,
    summary,
    isFile,
  }));
}
