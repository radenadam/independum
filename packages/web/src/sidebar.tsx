import type { ProjectSummary } from "independum/api-types";
import { type ReactElement, useState } from "react";
import type { ChatActions } from "./chat-row.tsx";
import { Icon } from "./icon.tsx";
import { IconButton } from "./icon-button.tsx";
import { Mark } from "./mark.tsx";
import { RowButton } from "./row-button.tsx";
import { shortcuts } from "./shortcut.ts";
import styles from "./sidebar.module.css";
import { SidebarChats } from "./sidebar-chats.tsx";
import { SlidingColumn } from "./sliding-column.tsx";
import { TextField } from "./text-field.tsx";

/** Properties of the sidebar. */
interface SidebarProps {
  projects: ProjectSummary[];
  chatId: string | null;
  folder: string;
  isOpen: boolean;
  isNewChatFlashing: boolean;
  onHide: () => void;
  onNewChat: (folder?: string) => void;
  chatActions: ChatActions;
  onOpenSettings: () => void;
}

/**
 * Draws the sidebar with New chat, the search, the pinned and recent chats, the projects with their
 * chats, and Settings.
 */
export function Sidebar({
  projects,
  chatId,
  folder,
  isOpen,
  isNewChatFlashing,
  onHide,
  onNewChat,
  chatActions,
  onOpenSettings,
}: SidebarProps): ReactElement {
  const [query, setQuery] = useState("");

  return (
    <SlidingColumn element="nav" label="Projects and chats" edge="start" isOpen={isOpen}>
      <div className={styles.top}>
        <div className={styles.brand}>
          <span className={styles.mark}>
            <Mark />
          </span>
          independum
        </div>
        <IconButton
          icon="sidebar"
          label="Hide sidebar"
          shortcut={shortcuts.sidebar}
          tipAlign="end"
          onClick={onHide}
        />
      </div>
      <div className={styles.actions}>
        <RowButton
          label="New chat"
          leading={<Icon name="newChat" />}
          shortcut={shortcuts.newChat}
          isStrong
          isFlashing={isNewChatFlashing}
          onClick={() => onNewChat()}
        />
        <TextField
          id="chat-search"
          label="Search chats"
          kind="search"
          value={query}
          onChange={setQuery}
        />
      </div>
      <div className={styles.list}>
        <SidebarChats
          projects={projects}
          query={query}
          chatId={chatId}
          folder={folder}
          actions={chatActions}
          onNewChat={onNewChat}
        />
      </div>
      <div className={styles.bottom}>
        <RowButton
          label="Settings"
          leading={<Icon name="settings" />}
          shortcut={shortcuts.settings}
          isQuiet
          onClick={onOpenSettings}
        />
      </div>
    </SlidingColumn>
  );
}
