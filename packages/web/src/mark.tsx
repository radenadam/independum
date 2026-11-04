import type { ReactElement } from "react";
import styles from "./mark.module.css";

const square = "M0 0H591V555H0Z";
const bird =
  "M279.7 65.6C255.1 69.4 223.4 84.6 187.8 109.8L177.1 117.4 172.6 129.9C146.6 201.8 124.5 262.2 117.1 281.3L116 284.1 121.8 279.6C158.7 250.6 167.3 244 168 244C169.1 244 193.1 283 227.6 340.7L255.8 387.9 256.5 471.4L257.3 555 331.6 555C372.5 555 406 554.8 406 554.6C406 554.4 404.7 547.6 403.1 539.4C398.4 515.8 391.6 480.9 385.5 449.5C376.4 402.2 366.8 353.5 353.1 284.6L340.1 219.7 341.6 216.7C345.8 208.7 358.6 199.9 371.5 196.1C380 193.7 423.8 188.8 528.5 178.8L552.5 176.6 536 174.8C477.6 168.4 361.4 153.7 360.2 152.5C359.3 151.6 386.4 152 404.5 153C427.2 154.4 457.9 157.7 520 165.5C548.4 169.1 572.5 172 573.5 172L575.5 172 573 169.9C565.9 164.3 548.4 153.2 539.1 148.5C527.5 142.7 461.2 120.8 424.1 110.4C419.2 109.1 415.7 107.1 408.6 101.6C377.3 77.2 371.6 74.4 344 68.9C318.3 63.9 297.4 62.8 279.7 65.6M293 112.3C285.7 113.4 285.8 113.6 298.2 117.1L305.9 119.3 309.6 125.6C323.3 149 340.6 152 360.1 134.2C364.2 130.5 368.7 126.8 370 125.9L372.5 124.2 359 120C332.5 111.6 312.5 109.2 293 112.3M198 368.7C156.3 398.4 32.6 487.9 3.3 509.7L0 512.1 0 533.6L0 555 59.5 555L119 555 169.3 454.5C196.9 399.2 219.3 354 219 354C218.7 354.1 209.3 360.6 198 368.7";

// The bird turned slightly toward the user, and facing the user, on the same neck and wing as the
// bird in profile, so only its head turns.
const tiltedBird =
  "M284.6 80.4L314.8 80.9L341.5 88.9L378.2 110.7L408.4 137L423.2 164.8L434.1 192.6L453.9 214.5L514.3 288.9L523.2 303.8L539 338.6L532.6 335.1L434.6 253.7L394 223.9L368.3 208L364.8 207.5L515.3 328.6L360.3 254.7L347.5 251.7L339.1 252.2L405.4 555L255.9 555L255.9 386.2L225.2 332.6L173.2 223.9L112.4 257.1L162.8 171.8L209.4 102.3L212.8 98.8L246.5 87.9ZM318.3 135L333.6 139.5L350.4 149.4L360.3 157.4L388.6 186.7L364.3 192.1L352.4 191.1L345.5 187.2L336.1 173.7L333.1 162.8L332.1 147.9ZM219.3 353.5L119.3 555L0 555L0 512.8L3 509.8Z";
const forwardBird =
  "M325.3 58.6L368.4 65L427.4 105.2L484.9 252.2L483.5 253.7L441.8 230.8L390.7 340.5L414.5 555L248 555L266.8 343.5L213.7 230.8L170.6 254.2L228.1 106.2L289.1 65ZM412.6 133L413.6 134L405.6 158.9L401.7 166.8L392.2 176.2L377.4 182.2L367.9 170.8L362 158.9L392.2 140.5ZM243 134L257.4 137.5L294.6 159.8L286.6 172.8L278.2 182.2L263.3 175.2L253.9 164.8ZM303.5 173.7L310.4 201.5L327.8 297.4L329.3 296.9L333.2 276L351.1 173.7L354.1 175.7L361 188.6L328.8 320.2L295.6 192.6L295.6 187.6ZM216.7 355.4L218.7 355.4L200.8 388.2L118.5 555L0 555L0 512.8L3 509.8Z";

/** The way the bird of the mark faces: in profile, as the logo shows it, slightly turned, or forward. */
type MarkTurn = "profile" | "tilt" | "front";

/** Properties of the mark. */
interface MarkProps {
  turn?: MarkTurn;
  className?: string | undefined;
}

const birds: Record<MarkTurn, string> = { profile: bird, tilt: tiltedBird, front: forwardBird };

/** Draws the Independum bird mark in the current text color, one line of text tall, facing one way. */
export function Mark({ turn = "profile", className }: MarkProps): ReactElement {
  return (
    <svg className={className} height="1em" viewBox="0 0 591 555" aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" d={square + birds[turn]} />
    </svg>
  );
}

/** Draws the mark with the bird rising into its square, for screens that greet the user. */
export function RisingMark(): ReactElement {
  // The mask cuts the bird out of the square. Painting the bird in the page color on top instead
  // leaves a hairline where the two edges meet.
  return (
    <svg className={styles.rising} viewBox="0 0 591 555" aria-hidden="true">
      <mask id="rising-mark-cutout">
        <rect width="591" height="555" fill="white" />
        <path className={styles.bird} fillRule="evenodd" fill="black" d={bird} />
      </mask>
      <rect className={styles.square} width="591" height="555" mask="url(#rising-mark-cutout)" />
    </svg>
  );
}
