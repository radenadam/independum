import type { ReactElement } from "react";
import { Icon, type IconName } from "./icon.tsx";
import styles from "./text-button.module.css";

/** Properties of a text button. */
interface TextButtonProps {
  label: string;
  onClick?: () => void;
  icon?: IconName;
  isPrimary?: boolean;
  isSubmit?: boolean;
}

/** Draws a button with a label, filled orange when it is the main action of its step. */
export function TextButton({
  label,
  onClick,
  icon,
  isPrimary = false,
  isSubmit = false,
}: TextButtonProps): ReactElement {
  return (
    <button
      type={isSubmit ? "submit" : "button"}
      className={isPrimary ? `${styles.button} ${styles.primary}` : styles.button}
      onClick={onClick}
    >
      {icon === undefined ? null : <Icon name={icon} size={16} />}
      {label}
    </button>
  );
}
