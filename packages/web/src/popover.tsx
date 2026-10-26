import type { ReactElement, ReactNode } from "react";
import styles from "./popover.module.css";

/** Properties of a pop-up. */
interface PopoverProps {
  label: string;
  side: "above" | "below";
  onClose: () => void;
  children: ReactNode;
}

/**
 * Draws a pop-up beside its button, which closes on Escape or on a click anywhere outside it.
 */
export function Popover({ label, side, onClose, children }: PopoverProps): ReactElement {
  return (
    <>
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close the menu"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={label}
        className={`${styles.popover} ${styles[side]}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        {children}
      </div>
    </>
  );
}
