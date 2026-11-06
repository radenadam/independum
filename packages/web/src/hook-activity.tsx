import type { ChatState } from "independum/api-types";
import { type ReactElement, useState } from "react";
import styles from "./hook-activity.module.css";
import { IconButton } from "./icon-button.tsx";
import { requestApi } from "./request-api.ts";

/** Shows the running hooks beside the message box with individual stop actions. */
export function HookActivity({ chat }: { chat: ChatState }): ReactElement {
  const [failure, setFailure] = useState<string>();
  async function stop(id: string): Promise<void> {
    setFailure(undefined);
    try {
      const response = await requestApi(
        `/api/chats/${encodeURIComponent(chat.id)}/hooks/invocations/${encodeURIComponent(id)}/stop`,
        { method: "POST" },
      );
      if (!response.ok && response.status !== 404) {
        throw new Error("The hook could not be stopped.");
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The hook could not be stopped.");
    }
  }
  return (
    <div className={styles.activity}>
      {failure === undefined ? null : <span className={styles.name}>{failure}</span>}
      {(chat.hookInvocations ?? []).map((invocation) => (
        <div className={styles.row} key={invocation.id}>
          <span className={styles.name}>Running hook {invocation.hookId}</span>
          <IconButton
            icon="stop"
            label={`Stop hook ${invocation.hookId}`}
            onClick={() => {
              stop(invocation.id);
            }}
          />
        </div>
      ))}
    </div>
  );
}
