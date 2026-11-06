import type { ReactElement } from "react";
import { Icon, type IconName } from "./icon.tsx";
import styles from "./icon-button.module.css";
import { describeShortcut, type Shortcut } from "./shortcut.ts";
import tooltipStyles from "./use-tooltip.module.css";

/** Properties of an icon button. */
interface IconButtonProps {
  hasVisibleLabel?: boolean;
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
  isExpanded?: boolean;
}

const iconSizes = { regular: 18, small: 16, tiny: 14 };

/** Draws an icon action with a tooltip and an optional visible label. */
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
  isExpanded,
  hasVisibleLabel = false,
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
      aria-expanded={isExpanded}
      data-labeled={hasVisibleLabel || undefined}
      onClick={onClick}
    >
      <span key={icon} className={styles.glyph}>
        <Icon name={icon} size={iconSizes[size]} />
      </span>
      {hasVisibleLabel ? <span>{label}</span> : null}
      <span
        className={`${tooltipStyles.tooltip} ${styles.tip} ${styles[tipSide]} ${styles[tipAlign]}`}
        aria-hidden="true"
      >
        {label}
        {keyName === undefined ? null : <span className={styles.key}>{keyName}</span>}
      </span>
    </button>
  );
}
