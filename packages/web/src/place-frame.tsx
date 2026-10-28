import type { ReactElement, ReactNode } from "react";
import styles from "./place-frame.module.css";

/** Properties of a place frame or a place note. */
interface PlaceFrameProps {
  children: ReactNode;
}

/** Draws the frame of a place in the side panel, which stacks its sections with room between them. */
export function PlaceFrame({ children }: PlaceFrameProps): ReactElement {
  return <div className={styles.frame}>{children}</div>;
}

/** Draws a short note in a place, in small muted type. */
export function PlaceNote({ children }: PlaceFrameProps): ReactElement {
  return <p className={styles.note}>{children}</p>;
}
