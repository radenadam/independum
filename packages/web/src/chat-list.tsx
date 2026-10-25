import type { ChatSummary } from "independum/api-types";
import type { ReactElement } from "react";
import styles from "./chat-list.module.css";
import { CommandButton } from "./command-button.tsx";
import { formatAge } from "./format-age.ts";
import { PickList } from "./pick-list.tsx";
import { ScreenHeading } from "./screen-heading.tsx";

/** Properties of the chat list. */
interface ChatListProps {
  chats: ChatSummary[] | undefined;
  currentId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
}

/** Draws the saved chats of this folder, newest first, with how long ago each one changed. */
export function ChatList({ chats, currentId, onOpen, onClose }: ChatListProps): ReactElement {
  const now = Date.now();
  return (
    <section className={styles.list} aria-label="Chats">
      <ScreenHeading
        title="Chats."
        intro="The chats in this folder, newest first. A chat is saved with its first message."
        command={<CommandButton shortcut="x" label="Close" onClick={onClose} isQuiet />}
      />
      {chats?.length === 0 ? (
        <p className={styles.note}>No saved chats yet.</p>
      ) : (
        <PickList
          entries={(chats ?? []).map((chat) => ({
            id: chat.id,
            name: chat.title,
            detail: formatAge(chat.modified, now),
          }))}
          pickedId={currentId ?? undefined}
          onPick={onOpen}
        />
      )}
    </section>
  );
}
