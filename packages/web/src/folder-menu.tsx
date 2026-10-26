import type { ProjectSummary } from "independum/api-types";
import type { ReactElement } from "react";
import styles from "./folder-menu.module.css";
import { MenuList } from "./menu-list.tsx";

/** Properties of the folder menu. */
interface FolderMenuProps {
  projects: ProjectSummary[];
  folder: string;
  onChoose: (folder: string) => void;
}

/** Draws the projects that a new chat can work in, with the chosen one checked. */
export function FolderMenu({ projects, folder, onChoose }: FolderMenuProps): ReactElement {
  return (
    <>
      <MenuList
        groups={[
          {
            key: "projects",
            heading: "Work in",
            choices: projects.map((project) => ({
              key: project.folder,
              name: project.name,
              detail: project.folder,
              isCurrent: project.folder === folder,
              onChoose: () => onChoose(project.folder),
            })),
          },
        ]}
        layout="stacked"
        emptyNote="No projects yet."
      />
      <p className={styles.note}>Opening another folder comes later.</p>
    </>
  );
}
