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
  | "latest"
  | "stop"
  | "check"
  | "copy"
  | "sidePanel"
  | "newTab"
  | "agent"
  | "close"
  | "more"
  | "edit"
  | "reset"
  | "pin"
  | "archive"
  | "export"
  | "delete"
  | "context"
  | "shell"
  | "stopCommand"
  | "background"
  | "checkCommand"
  | "read"
  | "write"
  | "steps"
  | "info";

// Returns the class names of a part that moves when its button is pointed at, as `docs/icons.md`
// describes under Motion. The second class sets how that part moves.
function moves(part: string | undefined): string {
  return `${styles.moves} ${part ?? ""}`;
}

// Each drawing follows `docs/icons.md`, on a 24 unit grid with corners cut at 45 degrees.
const drawings: Record<IconName, ReactElement> = {
  sidebar: (
    <>
      <path d="M5 4h14l2 2v12l-2 2H5l-2-2V6z" />
      <path className={moves(styles.sidebarLine)} d="M9 4v16" />
    </>
  ),
  newChat: (
    <>
      <path d="M12 3H5L3 5v14l2 2h14l2-2v-7" />
      <path className={moves(styles.pen)} d="M18.5 2.5l3 3-9.5 9.5-4 1 1-4z" />
    </>
  ),
  search: (
    <g className={moves(styles.lens)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M16 16l5 5" />
    </g>
  ),
  settings: (
    <>
      <path className={moves(styles.topLeft)} d="M3 7h10.5" />
      <path className={moves(styles.topRight)} d="M18.5 7H21" />
      <circle className={moves(styles.topKnob)} cx="16" cy="7" r="2.5" />
      <path className={moves(styles.bottomLeft)} d="M3 17h4.5" />
      <path className={moves(styles.bottomRight)} d="M12.5 17H21" />
      <circle className={moves(styles.bottomKnob)} cx="10" cy="17" r="2.5" />
    </>
  ),
  folder: (
    <>
      <path className={styles.folderClosed} d="M3 5l1-1h5l2 3h10l1 1v11l-1 1H4l-1-1z" />
      <g className={styles.folderOpen}>
        <path d="M5 20H4l-1-1V5l1-1h5l2 3h10l1 1v2" />
        <path d="M5 20l3-9 1-1h14.5l1 1-2.5 8-1 1z" />
      </g>
    </>
  ),
  expand: <path className={moves(styles.nudgeRight)} d="M9 5l7 7-7 7" />,
  menu: <path className={moves(styles.nudgeDown)} d="M5 9l7 7 7-7" />,
  add: <path className={moves(styles.twist)} d="M12 4v16M4 12h16" />,
  send: <path className={moves(styles.nudgeUp)} d="M12 20V5M5 11l7-7 7 7" />,
  latest: <path className={moves(styles.drop)} d="M12 4v15M5 13l7 7 7-7" />,
  stop: <path className={moves(styles.squeeze)} d="M9 8h6l1 1v6l-1 1H9l-1-1V9z" />,
  check: <path d="M20 6L9 17l-5-5" />,
  copy: (
    <>
      <path className={moves(styles.frontCopy)} d="M11 9h8l2 2v8l-2 2h-8l-2-2v-8z" />
      <path d="M5 15l-2-2V5l2-2h8l2 2" />
    </>
  ),
  sidePanel: (
    <>
      <path d="M5 4h14l2 2v12l-2 2H5l-2-2V6z" />
      <path className={moves(styles.panelLine)} d="M15 4v16" />
    </>
  ),
  newTab: (
    <>
      <path className={moves(styles.upperLeft)} d="M4 3h5l1 1v5l-1 1H4l-1-1V4z" />
      <path className={moves(styles.upperRight)} d="M15 3h5l1 1v5l-1 1h-5l-1-1V4z" />
      <path className={moves(styles.lowerLeft)} d="M4 14h5l1 1v5l-1 1H4l-1-1v-5z" />
      <path className={moves(styles.lowerRight)} d="M15 14h5l1 1v5l-1 1h-5l-1-1v-5z" />
    </>
  ),
  agent: (
    <>
      <path d="M12 8V4H8" />
      <path d="M6 8h12l2 2v8l-2 2H6l-2-2v-8z" />
      <path d="M1.5 14H4M20 14h2.5" />
      <path className={moves(styles.eyes)} d="M15 12.5v3M9 12.5v3" />
    </>
  ),
  close: <path className={moves(styles.twist)} d="M18 6L6 18M6 6l12 12" />,
  more: (
    <>
      <circle className={moves(styles.firstDot)} cx="5" cy="12" r="1" />
      <circle className={moves(styles.secondDot)} cx="12" cy="12" r="1" />
      <circle className={moves(styles.thirdDot)} cx="19" cy="12" r="1" />
    </>
  ),
  edit: (
    <g className={moves(styles.pencil)}>
      <path d="M15 4l5 5L9 20H4v-5z" />
      <path d="M12.5 6.5l5 5" />
    </g>
  ),
  reset: (
    <>
      <path className={moves(styles.nudgeLeft)} d="M9 4L4 9l5 5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H10" />
    </>
  ),
  pin: (
    <g className={moves(styles.press)}>
      <path d="M8 3h8" />
      <path d="M9.5 3v6l-3.5 4h12l-3.5-4V3" />
      <path d="M12 13v8" />
    </g>
  ),
  export: (
    <>
      <path className={moves(styles.drop)} d="M12 3v11M7.5 9.5L12 14l4.5-4.5" />
      <path d="M4 14v5l1 1h14l1-1v-5" />
    </>
  ),
  archive: (
    <>
      <path className={moves(styles.lid)} d="M4 4h16l1 1v2l-1 1H4L3 7V5z" />
      <path d="M5 8v10l2 2h10l2-2V8" />
      <path d="M10 12h4" />
    </>
  ),
  delete: (
    <>
      <g className={moves(styles.binLid)}>
        <path d="M3 6h18" />
        <path d="M9 6V3h6v3" />
      </g>
      <path d="M6 6v13l2 2h8l2-2V6" />
      <path d="M10 10v7M14 10v7" />
    </>
  ),
  context: (
    <>
      <circle className={`${styles.meterTrack} ${styles.thickRing}`} cx="12" cy="12" r="8.5" />
      <circle
        className={`${styles.meterFill} ${styles.thickRing} ${moves(styles.ringStart)}`}
        cx="12"
        cy="12"
        r="8.5"
        pathLength={1}
      />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  shell: (
    <>
      <path d="M5 4h14l2 2v12l-2 2H5l-2-2V6z" />
      <path className={moves(styles.prompt)} d="M7 9l3 3-3 3" />
      <path className={moves(styles.cursor)} d="M12 15h5" />
    </>
  ),
  background: (
    <>
      <path d="M9 9V5l2-2h8l2 2v8l-2 2h-4" />
      <path d="M5 9h8l2 2v8l-2 2H5l-2-2v-8z" />
      <path className={moves(styles.nudgeUpRight)} d="M6 18l6-6M8 12h4v4" />
    </>
  ),
  read: (
    <>
      <path d="M11 21H7l-2-2V5l2-2h7l4 4v3" />
      <g className={moves(styles.nudgeLeft)}>
        <circle cx="15.5" cy="15.5" r="3.5" />
        <path d="M18 18l3 3" />
      </g>
    </>
  ),
  write: (
    <>
      <path d="M11 21H7l-2-2V5l2-2h7l4 4v3" />
      <path className={moves(styles.twistCorner)} d="M16.5 12.5v8M12.5 16.5h8" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path className={moves(styles.nudgeUpLittle)} d="M12 7v2" />
      <path d="M12 11v6" />
    </>
  ),
  steps: (
    <>
      <path className={moves(styles.nudgeUp)} d="M5 4h14l1 1v2l-1 1H5L4 7V5z" />
      <path className={moves(styles.nudgeUpLittle)} d="M5 10h14l1 1v2l-1 1H5l-1-1v-2z" />
      <path d="M5 16h14l1 1v2l-1 1H5l-1-1v-2z" />
    </>
  ),
  checkCommand: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path className={moves(styles.nudgeUp)} d="M8.5 9.5h7M8.5 12h7M8.5 14.5h4" />
    </>
  ),
  stopCommand: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path className={moves(styles.squeeze)} d="M10 9h4l1 1v4l-1 1h-4l-1-1v-4z" />
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
