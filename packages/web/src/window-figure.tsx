import { type CSSProperties, type ReactElement, useLayoutEffect, useRef, useState } from "react";
import { describeShare } from "./describe-usage.ts";
import { IconButton } from "./icon-button.tsx";
import styles from "./window-figure.module.css";

/** What a stretch of a request holds, which gives it its color in the figure. */
export type FigureKind = "instructions" | "tools" | "summary" | "messages";

/** A stretch of a request in the figure: one part, or every tool of a run together. */
interface FigurePart {
  key: string;
  kind: FigureKind;
  tokens: number;
}

/** Properties of the figure of a context window. */
interface WindowFigureProps {
  parts: FigurePart[];
  used: number;
  windowSize: number | null;
  reserve: number | null;
  litKeys: ReadonlySet<string>;
  onLight: (key: string | undefined) => void;
  onOpen: (key: string) => void;
}

const kindNames: Record<FigureKind, string> = {
  instructions: "Instructions",
  tools: "Tools",
  summary: "Summary",
  messages: "Messages",
};
const kinds: FigureKind[] = ["instructions", "tools", "summary", "messages"];
const pinKey = "independum.windowPinned";
const numberFormat = new Intl.NumberFormat();

/**
 * Draws a context window and what fills it as a zoom bar: a thin bar is the window, and its part in
 * use opens below it to the full width, with each part in the color of what it holds, in the order the
 * model reads it. The bar and its caption stay at the top of the overview while the rest scrolls under
 * them, until the user lets them go, and a legend follows. The figure mirrors the list of parts under
 * it, which every keyboard and screen reader reaches, so it answers only the pointer.
 */
export function WindowFigure({
  parts,
  used,
  windowSize,
  reserve,
  litKeys,
  onLight,
  onOpen,
}: WindowFigureProps): ReactElement {
  const [isPinned, setIsPinned] = useState(readPin);
  const [isStuck, setIsStuck] = useState(false);
  const pinned = useRef<HTMLDivElement>(null);
  const hasWindow = windowSize !== null && windowSize > 0;
  const amounts = kinds.flatMap((kind) => {
    const tokens = parts
      .filter((part) => part.kind === kind)
      .reduce((sum, part) => sum + part.tokens, 0);
    return tokens > 0 ? [{ kind, name: kindNames[kind], tokens }] : [];
  });
  const kept = hasWindow ? (reserve ?? 0) : 0;
  const free = hasWindow ? Math.max(0, windowSize - used - kept) : 0;
  const usedPercent = hasWindow ? Math.min(100, (used / windowSize) * 100) : 0;

  // While the bar sits at the top of the overview, a line parts it from what scrolls under it.
  useLayoutEffect(() => {
    const element = pinned.current;
    const scroller = element === null ? null : scrollerOf(element);
    if (element === null || scroller === null || !isPinned) {
      setIsStuck(false);
      return;
    }
    function measure(): void {
      if (element !== null && scroller !== null) {
        const gap = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        setIsStuck(scroller.scrollTop > 0 && gap < 1);
      }
    }
    measure();
    scroller.addEventListener("scroll", measure, { passive: true });
    return () => scroller.removeEventListener("scroll", measure);
  }, [isPinned]);

  return (
    <>
      <div
        ref={pinned}
        className={styles.pinned}
        data-pinned={isPinned}
        data-stuck={isStuck}
        data-has-lit={litKeys.size > 0}
      >
        <div
          className={styles.drawing}
          aria-hidden="true"
          onPointerMove={(event) => onLight(keyAt(event.target))}
          onPointerLeave={() => onLight(undefined)}
          onClick={(event) => {
            const key = keyAt(event.target);
            if (key !== undefined) {
              onOpen(key);
            }
          }}
        >
          {hasWindow ? (
            <>
              <div
                className={styles.track}
                style={
                  { "--share": used / windowSize, "--kept": kept / windowSize } as CSSProperties
                }
              >
                <span className={styles.used} />
                {kept > 0 ? <span className={styles.kept} /> : null}
              </div>
              <svg
                className={styles.funnel}
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polygon points={`0,0 ${usedPercent},0 100,10 0,10`} />
              </svg>
            </>
          ) : null}
          <div className={styles.bar}>
            {parts.map((part) => (
              <span
                key={part.key}
                className={styles.segment}
                style={{ "--tokens": part.tokens } as CSSProperties}
                data-kind={part.kind}
                data-key={part.key}
                data-lit={litKeys.has(part.key)}
              />
            ))}
          </div>
        </div>
        <div className={styles.captionRow}>
          <p className={styles.caption}>
            {hasWindow ? describeShare(used, windowSize) : `${numberFormat.format(used)} tokens`}
          </p>
          <IconButton
            icon="pin"
            label={isPinned ? "Let the bar scroll away" : "Keep the bar in view"}
            size="tiny"
            isHighlighted={isPinned}
            onClick={() => {
              savePin(!isPinned);
              setIsPinned(!isPinned);
            }}
          />
        </div>
      </div>
      <div className={styles.legend}>
        {amounts.map((amount) => (
          <span key={amount.kind} className={styles.key}>
            <KindSwatch kind={amount.kind} />
            {amount.name}
            <span className={styles.amount}>~{numberFormat.format(Math.round(amount.tokens))}</span>
          </span>
        ))}
        {hasWindow ? (
          <span className={styles.key}>
            <KindSwatch kind="free" />
            Free
            <span className={styles.amount}>~{numberFormat.format(Math.round(free))}</span>
          </span>
        ) : null}
        {kept > 0 ? (
          <span className={styles.key}>
            <KindSwatch kind="kept" />
            Kept free by Pi
            <span className={styles.amount}>{numberFormat.format(kept)}</span>
          </span>
        ) : null}
      </div>
    </>
  );
}

/** Draws the small square of color that a kind of part, or a kind of room, takes in the figure. */
export function KindSwatch({ kind }: { kind: FigureKind | "free" | "kept" }): ReactElement {
  return <span className={styles.swatch} data-kind={kind} />;
}

// The bar stays in view unless the user let it go on this browser.
function readPin(): boolean {
  return localStorage.getItem(pinKey) !== "false";
}

function savePin(isPinned: boolean): void {
  localStorage.setItem(pinKey, String(isPinned));
}

// The overview scrolls in a box of its own, so the bar finds that box to know when it has stuck.
function scrollerOf(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
      return parent;
    }
  }
  return null;
}

// A segment names the part it belongs to, so the pointer finds the part under it.
function keyAt(target: EventTarget): string | undefined {
  return target instanceof HTMLElement
    ? target.closest<HTMLElement>("[data-key]")?.dataset.key
    : undefined;
}
