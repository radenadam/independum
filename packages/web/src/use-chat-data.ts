import type { ChatState } from "independum/api-types";
import { useEffect, useState } from "react";

/**
 * Returns data about the open chat that loads from the server once the chat is known, and loads
 * again when another chat opens, another model takes over, a reply starts or ends, or its settings
 * or compaction change.
 */
export function useChatData<Data>(
  load: () => Promise<Data>,
  chat: ChatState | undefined,
): { data: Data | undefined; failure: string | undefined } {
  const [loaded, setLoaded] = useState<{
    chatId: string | null;
    data: Data | undefined;
    failure: string | undefined;
  }>();
  const chatId = chat?.id;
  const modelId = chat?.model?.id;
  const providerId = chat?.model?.providerId;

  // A request goes out with every reply, so its data loads again when a reply starts or ends.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reply state and context version trigger a reload.
  useEffect(() => {
    if (chatId === undefined) {
      return;
    }
    let isCurrent = true;
    setLoaded({ chatId, data: undefined, failure: undefined });
    load().then(
      (loaded) => {
        if (isCurrent) {
          setLoaded({ chatId, data: loaded, failure: undefined });
        }
      },
      (error: unknown) => {
        if (isCurrent) {
          setLoaded({
            chatId,
            data: undefined,
            failure: error instanceof Error ? error.message : "The chat data could not be loaded.",
          });
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [chatId, chat?.isReplying, modelId, providerId, chat?.contextVersion, load]);

  return {
    data: loaded?.chatId === chatId ? loaded?.data : undefined,
    failure: loaded?.chatId === chatId ? loaded?.failure : undefined,
  };
}
