import type { ReactElement } from "react";
import { Icon } from "./icon.tsx";
import { IconButton } from "./icon-button.tsx";
import styles from "./place-trail.module.css";

/** Properties of the trail of a detail. */
interface PlaceTrailProps {
  back?: { label: string; onBack: () => void } | undefined;
  onClose?: (() => void) | undefined;
}

/**
 * Draws the bar over a detail of a place, with the way back named for where it goes, because the
 * detail names itself, and a button that closes a detail that sits beside what opened it.
 */
export function PlaceTrail({ back, onClose }: PlaceTrailProps): ReactElement {
  return (
    <nav className={styles.trail} aria-label="Detail">
      {back === undefined ? null : (
        <button type="button" className={styles.back} onClick={back.onBack}>
          <Icon name="expand" size={14} />
          {back.label}
        </button>
      )}
      {onClose === undefined ? null : (
        <span className={styles.close}>
          <IconButton icon="close" label="Close" size="small" onClick={onClose} />
        </span>
      )}
    </nav>
  );
}
