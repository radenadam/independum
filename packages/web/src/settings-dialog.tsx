import { type ReactElement, useEffect, useRef } from "react";
import { AppearanceSection } from "./appearance-section.tsx";
import { IconButton } from "./icon-button.tsx";
import { LoginsSection } from "./logins-section.tsx";
import styles from "./settings-dialog.module.css";

/** A section of the settings dialog. */
export type SettingsSection = "logins" | "appearance";

/** Properties of the settings dialog. */
interface SettingsDialogProps {
  section: SettingsSection | undefined;
  onSection: (section: SettingsSection) => void;
  onClose: () => void;
  onLoginsChanged: () => void;
}

const titles: Record<SettingsSection, string> = { logins: "Logins", appearance: "Appearance" };
const sections: SettingsSection[] = ["logins", "appearance"];

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
  const dialog = useRef<HTMLDialogElement>(null);

  // A modal dialog keeps the focus inside it and closes on Escape, which the browser handles.
  useEffect(() => {
    const element = dialog.current;
    if (section !== undefined && element?.open === false) {
      element.showModal();
    } else if (section === undefined && element?.open === true) {
      element.close();
    }
  }, [section]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: A click on the backdrop is for a pointer, and the keyboard closes the dialog with Escape, which the browser handles.
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label="Settings"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
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
            {section === "logins" ? (
              <LoginsSection onChanged={onLoginsChanged} />
            ) : (
              <AppearanceSection />
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
