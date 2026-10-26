import type { ChatSummary } from "independum/api-types";
import type { ReactElement } from "react";
import { type ChatActions, ChatRow } from "./chat-row.tsx";
import styles from "./chat-rows.module.css";

/** Properties of the chat rows. */
interface ChatRowsProps {
  chats: ChatSummary[];
  currentId: string | null;
  isNested: boolean;
  newIds: ReadonlySet<string>;
  actions: ChatActions;
}

/** Draws a list of chats in the sidebar, each with its own menu. */
export function ChatRows({
  chats,
  currentId,
  isNested,
  newIds,
  actions,
}: ChatRowsProps): ReactElement {
  return (
    <ul className={styles.chats}>
      {chats.map((chat) => (
        <li key={chat.id}>
          <ChatRow
            chat={chat}
            isCurrent={chat.id === currentId}
            isNested={isNested}
            isNew={newIds.has(chat.id)}
            actions={actions}
          />
        </li>
      ))}
    </ul>
  );
}
