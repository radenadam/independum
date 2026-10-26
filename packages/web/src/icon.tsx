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
  | "copy"
  | "sidePanel"
  | "newTab"
  | "agent"
  | "close"
  | "more"
  | "rename"
  | "pin"
  | "archive"
  | "delete";

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
  sidePanel: (
    <>
      <path d="M5 4h14l2 2v12l-2 2H5l-2-2V6z" />
      <path d="M15 4v16" />
    </>
  ),
  newTab: (
    <path d="M4 3h5l1 1v5l-1 1H4l-1-1V4zM15 3h5l1 1v5l-1 1h-5l-1-1V4zM4 14h5l1 1v5l-1 1H4l-1-1v-5zM15 14h5l1 1v5l-1 1h-5l-1-1v-5z" />
  ),
  agent: (
    <>
      <path d="M12 8V4H8" />
      <path d="M6 8h12l2 2v8l-2 2H6l-2-2v-8z" />
      <path d="M1.5 14H4M20 14h2.5M15 12.5v3M9 12.5v3" />
    </>
  ),
  close: <path d="M18 6L6 18M6 6l12 12" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  rename: (
    <>
      <path d="M15 4l5 5L9 20H4v-5z" />
      <path d="M12.5 6.5l5 5" />
    </>
  ),
  pin: (
    <>
      <path d="M8 3h8" />
      <path d="M9.5 3v6l-3.5 4h12l-3.5-4V3" />
      <path d="M12 13v8" />
    </>
  ),
  archive: (
    <>
      <path d="M4 4h16l1 1v2l-1 1H4L3 7V5z" />
      <path d="M5 8v10l2 2h10l2-2V8" />
      <path d="M10 12h4" />
    </>
  ),
  delete: (
    <>
      <path d="M3 6h18" />
      <path d="M9 6V3h6v3" />
      <path d="M6 6v13l2 2h8l2-2V6" />
      <path d="M10 10v7M14 10v7" />
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
