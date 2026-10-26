import { type ReactElement, type ReactNode, type SyntheticEvent, useEffect, useRef } from "react";
import styles from "./modal-dialog.module.css";

/** Properties of a modal dialog. */
interface ModalDialogProps {
  isOpen: boolean;
  label: string;
  className: string | undefined;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Draws a dialog over the page while it is open, which keeps the focus inside it and closes on
 * Escape or a click outside it.
 */
export function ModalDialog({
  isOpen,
  label,
  className,
  onClose,
  children,
}: ModalDialogProps): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);

  // A modal dialog keeps the focus inside it and closes on Escape, which the browser handles.
  useEffect(() => {
    const element = dialog.current;
    if (isOpen && element?.open === false) {
      element.showModal();
    } else if (!isOpen && element?.open === true) {
      element.close();
    }
  }, [isOpen]);

  // React hands this dialog the events of a dialog inside it, such as a confirmation closing, so
  // only events of its own close it. A click on the dialog itself is a click on its backdrop.
  function closeOnOwnEvent(event: SyntheticEvent<HTMLDialogElement>): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: A click on the backdrop is for a pointer, and the keyboard closes the dialog with Escape, which the browser handles.
    <dialog
      ref={dialog}
      className={`${styles.dialog} ${className ?? ""}`}
      aria-label={label}
      onClose={closeOnOwnEvent}
      onClick={closeOnOwnEvent}
    >
      {isOpen ? children : null}
    </dialog>
  );
}
