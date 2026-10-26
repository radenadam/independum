import type { ReactElement } from "react";
import styles from "./icon.module.css";

/** The name of an icon in the set that `docs/icons.md` describes. */
export type IconName =
  | "sidebar"
  | "newChat"
  | "search"
  | "settings"
  | "folder"
  | "expand"
  | "menu"
  | "add"
  | "send"
  | "stop"
  | "check"
  | "copy";

// Each drawing follows `docs/icons.md`, on a 24 unit grid with corners cut at 45 degrees.
const drawings: Record<IconName, ReactElement> = {
  sidebar: (
    <>
      <path d="M5 4h14l2 2v12l-2 2H5l-2-2V6z" />
      <path d="M9 4v16" />
    </>
  ),
  newChat: (
    <>
      <path d="M12 3H5L3 5v14l2 2h14l2-2v-7" />
      <path d="M18.5 2.5l3 3-9.5 9.5-4 1 1-4z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16 16l5 5" />
    </>
  ),
  settings: (
    <>
      <path d="M3 7h10.5M18.5 7H21M3 17h4.5M12.5 17H21" />
      <circle cx="16" cy="7" r="2.5" />
      <circle cx="10" cy="17" r="2.5" />
    </>
  ),
  folder: <path d="M3 5l1-1h5l2 3h10l1 1v11l-1 1H4l-1-1z" />,
  expand: <path d="M9 5l7 7-7 7" />,
  menu: <path d="M5 9l7 7 7-7" />,
  add: <path d="M12 4v16M4 12h16" />,
  send: <path d="M12 20V5M5 11l7-7 7 7" />,
  stop: <path d="M9 8h6l1 1v6l-1 1H9l-1-1V9z" />,
  check: <path d="M20 6L9 17l-5-5" />,
  copy: (
    <>
      <path d="M11 9h8l2 2v8l-2 2h-8l-2-2v-8z" />
      <path d="M5 15l-2-2V5l2-2h8l2 2" />
    </>
  ),
};

/** Properties of an icon. */
interface IconProps {
  name: IconName;
  size?: number;
}

/** Draws an outline icon in the current text color, hidden from screen readers. */
export function Icon({ name, size = 18 }: IconProps): ReactElement {
  return (
    <svg
      className={styles.icon}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {drawings[name]}
    </svg>
  );
}
