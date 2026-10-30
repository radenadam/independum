import type { ChatSummary } from "independum/api-types";
import { type KeyboardEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { ActionMenu } from "./action-menu.tsx";
import styles from "./chat-row.module.css";
import { IconButton } from "./icon-button.tsx";
import { OneLineTitle } from "./one-line-title.tsx";
import { Popover } from "./popover.tsx";
import { RowWithAction } from "./row-with-action.tsx";

/** What a chat row can do with its chat. */
export interface ChatActions {
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onPin: (id: string, isPinned: boolean) => void;
  onExport: (chat: ChatSummary) => void;
  onArchive: (id: string) => void;
  onDelete: (chat: ChatSummary) => void;
}

/** Properties of a chat row. */
interface ChatRowProps {
  chat: ChatSummary;
  isCurrent: boolean;
  isNested: boolean;
  isNew: boolean;
  actions: ChatActions;
}

/**
 * Draws a chat in the sidebar, with a menu to rename, pin, archive, or delete it, which opens from
 * its dots or a right click.
 */
export function ChatRow({ chat, isCurrent, isNested, isNew, actions }: ChatRowProps): ReactElement {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | undefined>();
  const [isRenaming, setIsRenaming] = useState(false);
  const dots = useRef<HTMLSpanElement>(null);

  function act(action: () => void): () => void {
    return () => {
      setMenuAt(undefined);
      action();
    };
  }

  if (isRenaming) {
    return (
      <RenameField
        title={chat.title}
        isNested={isNested}
        onDone={(name) => {
          setIsRenaming(false);
          if (name !== undefined && name !== chat.title) {
            actions.onRename(chat.id, name);
          }
        }}
      />
    );
  }

  return (
    <>
      <RowWithAction
        action={
          <IconButton
            icon="more"
            label="Chat actions"
            size="tiny"
            tipAlign="end"
            isBlended
            isExpanded={menuAt !== undefined}
            onClick={() => {
              const rect = dots.current?.getBoundingClientRect();
              setMenuAt(rect === undefined ? undefined : { x: rect.left, y: rect.bottom + 4 });
            }}
          />
        }
        actionRef={dots}
        isActionShown={menuAt !== undefined}
      >
        <button
          type="button"
          className={styles.chat}
          title={chat.title}
          data-nested={isNested}
          aria-current={isCurrent ? "true" : undefined}
          onClick={() => actions.onOpen(chat.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuAt({ x: event.clientX, y: event.clientY });
          }}
        >
          <OneLineTitle text={chat.title} isTyped={isNew} />
        </button>
      </RowWithAction>
      {menuAt === undefined ? null : (
        <Popover
          label="Chat actions"
          place={menuAt}
          onClose={() => setMenuAt(undefined)}
          size="narrow"
        >
          <ActionMenu
            label={`Actions for ${chat.title}`}
            groups={[
              [
                { icon: "edit", label: "Rename", onSelect: act(() => setIsRenaming(true)) },
                {
                  icon: "pin",
                  label: chat.isPinned ? "Unpin" : "Pin",
                  onSelect: act(() => actions.onPin(chat.id, !chat.isPinned)),
                },
              ],
              [
                {
                  icon: "export",
                  label: "Export as Markdown",
                  onSelect: act(() => actions.onExport(chat)),
                },
              ],
              [
                {
                  icon: "archive",
                  label: "Archive",
                  onSelect: act(() => actions.onArchive(chat.id)),
                },
                { icon: "delete", label: "Delete", onSelect: act(() => actions.onDelete(chat)) },
              ],
            ]}
          />
        </Popover>
      )}
    </>
  );
}

/** Properties of the rename field. */
interface RenameFieldProps {
  title: string;
  isNested: boolean;
  onDone: (name: string | undefined) => void;
}

// Enter or leaving the field keeps the new name, and Escape keeps the old one.
function RenameField({ title, isNested, onDone }: RenameFieldProps): ReactElement {
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(title);

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      onDone(name.trim() === "" ? undefined : name.trim());
    } else if (event.key === "Escape") {
      event.preventDefault();
      onDone(undefined);
    }
  }

  return (
    <input
      ref={field}
      className={styles.rename}
      data-nested={isNested}
      aria-label="Chat name"
      value={name}
      onChange={(event) => setName(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => onDone(name.trim() === "" ? undefined : name.trim())}
    />
  );
}
