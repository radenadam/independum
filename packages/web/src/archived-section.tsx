import type { ArchivedChatSummary } from "independum/api-types";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import styles from "./archived-section.module.css";
import { BoxedList } from "./boxed-list.tsx";
import { archiveChat, fetchArchivedChats } from "./chat-api.ts";
import { DeleteChatDialog } from "./delete-chat-dialog.tsx";
import { TextButton } from "./text-button.tsx";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** Draws the archived chats, with a way to bring each back to the sidebar or delete it for good. */
export function ArchivedSection(): ReactElement {
  const [chats, setChats] = useState<ArchivedChatSummary[] | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [chatToDelete, setChatToDelete] = useState<ArchivedChatSummary | undefined>();

  const load = useCallback((): void => {
    fetchArchivedChats().then(setChats, () => {
      setChats([]);
      setNotice("The archived chats could not be loaded.");
    });
  }, []);

  useEffect(load, [load]);

  // The list loads again after each change, so it matches the files even when a change fails.
  function change(work: Promise<void>, failure: string): void {
    setNotice(undefined);
    work.catch(() => setNotice(failure)).finally(load);
  }

  if (chats === undefined) {
    return <p className={styles.note}>Loading the archived chats.</p>;
  }

  return (
    <div className={styles.section}>
      <p className={styles.note}>
        Archived chats stay out of the sidebar, and their files wait in
        ~/.independum/sessions/archived. Unarchive a chat to list it in its project again.
      </p>
      {notice === undefined ? null : <p className={styles.notice}>{notice}</p>}
      {chats.length === 0 ? (
        <p className={styles.note}>
          No chats are archived. Archive one from its menu in the sidebar.
        </p>
      ) : (
        <BoxedList
          hasLongNames
          entries={chats.map((chat) => ({
            key: chat.id,
            name: chat.title,
            detail: `${chat.projectName}, ${dateFormat.format(chat.modified)}`,
            tooltip: `${chat.title}\n${chat.folder}`,
            trailing: (
              <>
                <TextButton
                  label="Unarchive"
                  onClick={() =>
                    change(
                      archiveChat(chat.id, false),
                      "The chat could not be unarchived. Try again.",
                    )
                  }
                />
                <TextButton label="Delete" onClick={() => setChatToDelete(chat)} />
              </>
            ),
          }))}
        />
      )}
      {chatToDelete === undefined ? null : (
        <DeleteChatDialog
          chat={chatToDelete}
          isArchived
          onClose={() => setChatToDelete(undefined)}
          onDone={(failure) => {
            setNotice(failure);
            load();
          }}
        />
      )}
    </div>
  );
}
