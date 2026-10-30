import type { ReactElement, ReactNode } from "react";
import styles from "./row-button.module.css";
import { describeShortcut, type Shortcut } from "./shortcut.ts";
import { useTooltip } from "./use-tooltip.tsx";

/** Properties of a row button. */
interface RowButtonProps {
  label: string;
  leading: ReactNode;
  onClick: () => void;
  shortcut?: Shortcut;
  tooltip?: string;
  role?: "menuitem";
  isExpanded?: boolean;
  isStrong?: boolean;
  isQuiet?: boolean;
  isFlashing?: boolean;
}

/** Draws a button as wide as its list, with icons before its label and its shortcut after it. */
export function RowButton({
  label,
  leading,
  onClick,
  shortcut,
  tooltip,
  role,
  isExpanded,
  isStrong = false,
  isQuiet = false,
  isFlashing = false,
}: RowButtonProps): ReactElement {
  const classes = [styles.row, isStrong ? styles.strong : "", isQuiet ? styles.quiet : ""];
  const keyName = shortcut === undefined ? undefined : describeShortcut(shortcut);
  const tip = useTooltip(tooltip);
  return (
    <button
      type="button"
      className={classes.join(" ")}
      role={role}
      aria-keyshortcuts={keyName}
      aria-expanded={isExpanded}
      data-flashing={isFlashing}
      onClick={onClick}
      {...tip.handlers}
    >
      {leading}
      <span className={styles.label}>{label}</span>
      {keyName === undefined ? null : <span className={styles.key}>{keyName}</span>}
      {tip.tooltip}
    </button>
  );
}
