import type { ReactElement } from "react";
import styles from "./confirm-dialog.module.css";
import { ModalDialog } from "./modal-dialog.tsx";
import { TextButton } from "./text-button.tsx";

/** Properties of a confirm dialog. */
interface ConfirmDialogProps {
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Draws a dialog that asks before an action that cannot be undone. */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactElement {
  return (
    <ModalDialog isOpen label={title} className={styles.dialog} onClose={onCancel}>
      <div className={styles.body}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.text}>{text}</p>
        <div className={styles.buttons}>
          <TextButton label="Cancel" onClick={onCancel} />
          <TextButton label={confirmLabel} onClick={onConfirm} isPrimary />
        </div>
      </div>
    </ModalDialog>
  );
}
