import type { ChatState } from "independum/api-types";
import { useCallback } from "react";
import { useServerData } from "./use-server-data.ts";

/**
 * Returns data about the open chat that loads from the server once the chat is known, and loads
 * again when another chat opens, another model takes over, a reply starts or ends, its settings or
 * compaction change, or the UI reaches the server again after it was away.
 */
export function useChatData<Data>(
  load: (id: string) => Promise<Data>,
  chat: ChatState | undefined,
  identity: (string | number | null)[] = [],
): { data: Data | undefined; failure: string | undefined } {
  const chatId = chat?.id;
  const loadChat = useCallback(
    (): Promise<Data> =>
      chatId === undefined ? Promise.reject(new Error("No chat is open.")) : load(chatId),
    [load, chatId],
  );
  // A request goes out with every reply, so its data loads again when a reply starts or ends.
  const { data, failure } = useServerData(
    chatId === undefined ? undefined : loadChat,
    JSON.stringify([
      chat?.isReplying,
      chat?.model?.providerId,
      chat?.model?.id,
      chat?.contextVersion,
    ]),
    // Data shown during a reload belongs to the same chat and identity, such as a profile and its
    // revision, so an edit never uses data loaded for another resource.
    JSON.stringify([chatId ?? null, ...identity]),
  );
  return { data, failure };
}
