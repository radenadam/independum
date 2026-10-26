import type { ReactElement } from "react";
import { Icon, type IconName } from "./icon.tsx";
import styles from "./icon-button.module.css";
import { describeShortcut, type Shortcut } from "./shortcut.ts";

/** Properties of an icon button. */
interface IconButtonProps {
  icon: IconName;
  label: string;
  onClick: () => void;
  shortcut?: Shortcut;
  keyName?: string;
  tipSide?: "below" | "above";
  tipAlign?: "center" | "start" | "end";
  size?: "regular" | "small" | "tiny";
  isRound?: boolean;
  isFilled?: boolean;
  isHighlighted?: boolean;
  isBlended?: boolean;
}

const iconSizes = { regular: 18, small: 16, tiny: 14 };

/** Draws a button that shows only an icon, with a tooltip that names it and its shortcut. */
export function IconButton({
  icon,
  label,
  onClick,
  shortcut,
  keyName = shortcut === undefined ? undefined : describeShortcut(shortcut),
  tipSide = "below",
  tipAlign = "center",
  size = "regular",
  isRound = false,
  isFilled = false,
  isHighlighted = false,
  isBlended = false,
}: IconButtonProps): ReactElement {
  const classes = [
    styles.button,
    styles[size],
    isRound ? styles.round : "",
    isFilled ? styles.filled : "",
    isHighlighted ? styles.highlighted : "",
    isBlended ? styles.blended : "",
  ];
  // The icon is keyed by its name, so a changed icon fades in, such as copy turning into a check.
  return (
    <button
      type="button"
      className={classes.join(" ")}
      aria-label={label}
      aria-keyshortcuts={keyName}
      onClick={onClick}
    >
      <span key={icon} className={styles.glyph}>
        <Icon name={icon} size={iconSizes[size]} />
      </span>
      <span className={`${styles.tip} ${styles[tipSide]} ${styles[tipAlign]}`} aria-hidden="true">
        {label}
        {keyName === undefined ? null : <span className={styles.key}>{keyName}</span>}
      </span>
    </button>
  );
}
