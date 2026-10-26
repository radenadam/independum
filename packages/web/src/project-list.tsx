import type { ProjectSummary } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { Icon } from "./icon.tsx";
import { IconButton } from "./icon-button.tsx";
import styles from "./project-list.module.css";
import { SlidingTitle } from "./sliding-title.tsx";

/** Properties of the project list. */
interface ProjectListProps {
  projects: ProjectSummary[];
  query: string;
  chatId: string | null;
  folder: string;
  onOpenChat: (id: string) => void;
  onNewChat: (folder: string) => void;
}

/** Draws the projects with their chats, which unfold on a click and filter by the search. */
export function ProjectList({
  projects,
  query,
  chatId,
  folder,
  onOpenChat,
  onNewChat,
}: ProjectListProps): ReactElement {
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const search = query.trim().toLowerCase();

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

  if (shown.length === 0) {
    return <p className={styles.note}>No chats match.</p>;
  }

  return (
    <ul className={styles.projects}>
      {shown.map((project) => (
        <li key={project.folder}>
          <div className={styles.project}>
            <button
              type="button"
              className={styles.projectButton}
              title={project.folder}
              aria-expanded={project.isOpen}
              onClick={() => setOpen(project.folder, !project.isOpen)}
            >
              <span className={styles.chevron}>
                <Icon name="expand" size={14} />
              </span>
              <span className={styles.folderIcon}>
                <Icon name="folder" size={16} />
              </span>
              <span className={styles.name}>{project.name}</span>
            </button>
            <span className={styles.add}>
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
            </span>
          </div>
          <div className={styles.fold} data-open={project.isOpen}>
            <div className={styles.foldInner}>
              {project.chats.length === 0 ? (
                <p className={styles.empty}>No chats yet.</p>
              ) : (
                <ul className={styles.chats}>
                  {project.chats.map((chat) => (
                    <li key={chat.id}>
                      <button
                        type="button"
                        className={styles.chat}
                        title={chat.title}
                        aria-current={chat.id === chatId ? "true" : undefined}
                        onClick={() => onOpenChat(chat.id)}
                      >
                        <SlidingTitle text={chat.title} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
