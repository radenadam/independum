import type { ReactElement } from "react";
import { AppearanceSection } from "./appearance-section.tsx";
import { ArchivedSection } from "./archived-section.tsx";
import { IconButton } from "./icon-button.tsx";
import { LoginsSection } from "./logins-section.tsx";
import { ModalDialog } from "./modal-dialog.tsx";
import styles from "./settings-dialog.module.css";

/** A section of the settings dialog. */
export type SettingsSection = "logins" | "appearance" | "archived";

/** Properties of the settings dialog. */
interface SettingsDialogProps {
  section: SettingsSection | undefined;
  onSection: (section: SettingsSection) => void;
  onClose: () => void;
  onLoginsChanged: () => void;
}

const titles: Record<SettingsSection, string> = {
  logins: "Logins",
  appearance: "Appearance",
  archived: "Archived chats",
};
const sections: SettingsSection[] = ["logins", "appearance", "archived"];

/**
 * Draws the settings over the working screen while a section is open, and closes on Escape or a
 * click outside it.
 */
export function SettingsDialog({
  section,
  onSection,
  onClose,
  onLoginsChanged,
}: SettingsDialogProps): ReactElement {
  return (
    <ModalDialog
      isOpen={section !== undefined}
      label="Settings"
      className={styles.dialog}
      onClose={onClose}
    >
      {section === undefined ? null : (
        <div className={styles.frame}>
          <nav className={styles.nav} aria-label="Settings sections">
            <h2 className={styles.title}>Settings</h2>
            {sections.map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={styles.section}
                aria-current={candidate === section ? "true" : undefined}
                onClick={() => onSection(candidate)}
              >
                {titles[candidate]}
              </button>
            ))}
          </nav>
          <div className={styles.body}>
            <div className={styles.header}>
              <h2 className={styles.heading}>{titles[section]}</h2>
              <IconButton
                icon="close"
                label="Close"
                keyName="Esc"
                tipAlign="end"
                onClick={onClose}
              />
            </div>
            {section === "logins" ? <LoginsSection onChanged={onLoginsChanged} /> : null}
            {section === "appearance" ? <AppearanceSection /> : null}
            {section === "archived" ? <ArchivedSection /> : null}
          </div>
        </div>
      )}
    </ModalDialog>
  );
}
