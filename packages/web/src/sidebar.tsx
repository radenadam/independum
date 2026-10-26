import type { ProjectSummary } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { Icon } from "./icon.tsx";
import { IconButton } from "./icon-button.tsx";
import { Mark } from "./mark.tsx";
import { ProjectList } from "./project-list.tsx";
import { SearchField } from "./search-field.tsx";
import { describeShortcut, shortcuts } from "./shortcut.ts";
import styles from "./sidebar.module.css";

/** Properties of the sidebar. */
interface SidebarProps {
  projects: ProjectSummary[];
  chatId: string | null;
  folder: string;
  isOpen: boolean;
  isNewChatFlashing: boolean;
  onHide: () => void;
  onNewChat: (folder?: string) => void;
  onOpenChat: (id: string) => void;
  onOpenSettings: () => void;
}

/** Draws the sidebar with New chat, the search, the projects with their chats, and Settings. */
export function Sidebar({
  projects,
  chatId,
  folder,
  isOpen,
  isNewChatFlashing,
  onHide,
  onNewChat,
  onOpenChat,
  onOpenSettings,
}: SidebarProps): ReactElement {
  const [query, setQuery] = useState("");

  return (
    <nav
      className={styles.sidebar}
      aria-label="Projects and chats"
      data-open={isOpen}
      inert={!isOpen}
    >
      <div className={styles.inner}>
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
          <button
            type="button"
            className={styles.row}
            data-flashing={isNewChatFlashing}
            aria-keyshortcuts={describeShortcut(shortcuts.newChat)}
            onClick={() => onNewChat()}
          >
            <Icon name="newChat" />
            <span className={styles.label}>New chat</span>
            <span className={styles.key}>{describeShortcut(shortcuts.newChat)}</span>
          </button>
          <SearchField label="Search chats" value={query} onChange={setQuery} />
        </div>
        <div className={styles.list}>
          <h2 className={styles.heading}>Projects</h2>
          <ProjectList
            projects={projects}
            query={query}
            chatId={chatId}
            folder={folder}
            onOpenChat={onOpenChat}
            onNewChat={onNewChat}
          />
        </div>
        <div className={styles.bottom}>
          <button
            type="button"
            className={`${styles.row} ${styles.quiet}`}
            aria-keyshortcuts={describeShortcut(shortcuts.settings)}
            onClick={onOpenSettings}
          >
            <Icon name="settings" />
            <span className={styles.label}>Settings</span>
            <span className={styles.key}>{describeShortcut(shortcuts.settings)}</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
