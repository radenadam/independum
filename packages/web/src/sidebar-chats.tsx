import type { ProjectSummary } from "independum/api-types";
import { type ReactElement, useState } from "react";
import type { ChatActions } from "./chat-row.tsx";
import { ChatRows } from "./chat-rows.tsx";
import { Icon } from "./icon.tsx";
import { IconButton } from "./icon-button.tsx";
import { RowButton } from "./row-button.tsx";
import { RowWithAction } from "./row-with-action.tsx";
import styles from "./sidebar-chats.module.css";

/** Properties of the chats in the sidebar. */
interface SidebarChatsProps {
  projects: ProjectSummary[];
  query: string;
  chatId: string | null;
  folder: string;
  actions: ChatActions;
  onNewChat: (folder: string) => void;
}

// Recent shows this many of the newest chats that are not pinned.
const recentCount = 5;

/**
 * Draws the pinned chats, the recent chats, and the projects with their chats, which unfold on a
 * click and filter by the search.
 */
export function SidebarChats({
  projects,
  query,
  chatId,
  folder,
  actions,
  onNewChat,
}: SidebarChatsProps): ReactElement {
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const search = query.trim().toLowerCase();
  const chats = projects
    .flatMap((project) => project.chats)
    .toSorted((first, second) => second.modified - first.modified);
  const pinned = chats.filter((chat) => chat.isPinned);
  const recent = chats.filter((chat) => !chat.isPinned).slice(0, recentCount);

  function setOpen(projectFolder: string, isOpen: boolean): void {
    setToggled((current) => new Map(current).set(projectFolder, isOpen));
  }

  const shown = projects.flatMap((project) => {
    const chats = project.chats.filter((chat) => chat.title.toLowerCase().includes(search));
    if (search !== "" && chats.length === 0) {
      return [];
    }
    // The project of the open chat starts unfolded, and a search unfolds every project it matches.
    const isOpen = search !== "" || (toggled.get(project.folder) ?? project.folder === folder);
    return [{ ...project, chats, isOpen }];
  });

  // A search looks through the projects alone, so each chat that matches shows once.
  return (
    <>
      {search !== "" || pinned.length === 0 ? null : (
        <>
          <h2 className={styles.heading}>Pinned</h2>
          <ChatRows chats={pinned} currentId={chatId} isNested={false} actions={actions} />
        </>
      )}
      {search !== "" || recent.length === 0 ? null : (
        <>
          <h2 className={styles.heading}>Recent</h2>
          <ChatRows chats={recent} currentId={chatId} isNested={false} actions={actions} />
        </>
      )}
      <h2 className={styles.heading}>Projects</h2>
      {shown.length === 0 ? <p className={styles.note}>No chats match.</p> : null}
      <ul className={styles.projects}>
        {shown.map((project) => (
          <li key={project.folder}>
            <RowWithAction
              action={
                <IconButton
                  icon="add"
                  label={`New chat in ${project.name}`}
                  size="small"
                  tipAlign="end"
                  onClick={() => {
                    setOpen(project.folder, true);
                    onNewChat(project.folder);
                  }}
                />
              }
            >
              <RowButton
                label={project.name}
                leading={
                  <span className={styles.lead} data-open={project.isOpen}>
                    <span className={styles.chevron}>
                      <Icon name="expand" size={14} />
                    </span>
                    <Icon name="folder" size={16} />
                  </span>
                }
                title={project.folder}
                isExpanded={project.isOpen}
                isStrong
                onClick={() => setOpen(project.folder, !project.isOpen)}
              />
            </RowWithAction>
            <div className={styles.fold} data-open={project.isOpen}>
              <div className={styles.foldInner}>
                {project.chats.length === 0 ? (
                  <p className={styles.empty}>No chats yet.</p>
                ) : (
                  <ChatRows chats={project.chats} currentId={chatId} isNested actions={actions} />
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
