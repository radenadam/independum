import type {
  AttachmentPreview,
  AttachmentSettings,
  AttachmentSummary,
} from "independum/api-types";
import { useCallback, useEffect, useState } from "react";
import { previewAttachment, uploadAttachment } from "./attachment-api.ts";
import { readDraftAttachments, saveDraftAttachments } from "./chat-draft.ts";
import { useReconnections } from "./use-reconnections.ts";

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
  editId?: string,
): AttachmentDraft {
  const [drafts, setDrafts] = useState<Record<string, DraftAttachment[]>>({});
  const draftKey = JSON.stringify([chatId, editId]);
  const items = chatId === null ? [] : (drafts[draftKey] ?? readAttachments(chatId, editId));
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
        const key = JSON.stringify([id, editId]);
        const next = change(current[key] ?? readAttachments(id, editId));
        const retained = next.flatMap((item) =>
          item.summary === undefined ? [] : [{ summary: item.summary, isFile: item.isFile }],
        );
        saveDraftAttachments(id, retained, editId);
        return { ...current, [key]: next };
      });
    },
    [editId],
  );
  const reconnections = useReconnections();

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reconnection prepares the previews again.
  useEffect(() => {
    if (chatId === null) {
      return;
    }
    const openChatId = chatId;
    let isCurrent = true;
    function change(key: string, next: Partial<DraftAttachment>): void {
      update(openChatId, (current) =>
        current.map((entry) => (entry.key === key ? { ...entry, ...next } : entry)),
      );
    }
    for (const item of JSON.parse(requests) as { key: string; id: string; isFile: boolean }[]) {
      change(item.key, { preview: undefined, error: undefined });
      previewAttachment(chatId, item.id, item.isFile).then(
        (preview) => {
          if (isCurrent) {
            change(item.key, { preview, preparation, error: undefined });
          }
        },
        (error: unknown) => {
          if (isCurrent) {
            change(item.key, {
              error: error instanceof Error ? error.message : "The attachment cannot be prepared.",
            });
          }
        },
      );
    }
    return () => {
      isCurrent = false;
    };
  }, [chatId, preparation, requests, update, reconnections]);

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

function readAttachments(chatId: string, editId?: string): DraftAttachment[] {
  return readDraftAttachments(chatId, editId).map(({ summary, isFile }) => ({
    key: summary.id,
    name: summary.name,
    summary,
    isFile,
  }));
}
