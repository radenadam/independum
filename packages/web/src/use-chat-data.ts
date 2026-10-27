import type { ChatState } from "independum/api-types";
import { useEffect, useState } from "react";

/**
 * Returns data about the open chat that loads from the server, and loads again when another chat
 * opens, another model takes over, or a reply starts or ends.
 */
export function useChatData<Data>(load: () => Promise<Data>, chat: ChatState): Data | undefined {
  const [data, setData] = useState<Data | undefined>();
  const modelId = chat.model?.id;

  // biome-ignore lint/correctness/useExhaustiveDependencies: A request goes out with every message, so the data loads again when a reply starts or ends, and when another chat or model takes over.
  useEffect(() => {
    let isCurrent = true;
    load().then(
      (loaded) => {
        if (isCurrent) {
          setData(loaded);
        }
      },
      () => undefined,
    );
    return () => {
      isCurrent = false;
    };
  }, [chat.id, chat.isReplying, modelId]);

  return data;
}
