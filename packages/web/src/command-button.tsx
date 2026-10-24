import { type ReactElement, useEffect } from "react";
import styles from "./command-button.module.css";

/** Properties of a command button. */
interface CommandButtonProps {
  shortcut: string;
  label: string;
  onClick: () => void;
  isQuiet?: boolean;
}

/** Draws a text button with its keyboard shortcut in brackets, which the key also triggers. */
export function CommandButton({
  shortcut,
  label,
  onClick,
  isQuiet = false,
}: CommandButtonProps): ReactElement {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const isTyping = event.target instanceof Element && event.target.closest("input, textarea");
      if (event.key.toLowerCase() !== shortcut || isTyping || event.ctrlKey || event.metaKey) {
        return;
      }
      event.preventDefault();
      onClick();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcut, onClick]);

  return (
    <button
      type="button"
      className={isQuiet ? `${styles.command} ${styles.quiet}` : styles.command}
      aria-keyshortcuts={shortcut}
      onClick={onClick}
    >
      <span className={styles.shortcut}>[{shortcut}]</span> {label}{" "}
      <span className={styles.arrow} aria-hidden="true">
        &gt;
      </span>
    </button>
  );
}
