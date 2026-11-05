import type { CSSProperties, ReactElement } from "react";
import { describeShare } from "./describe-usage.ts";
import styles from "./window-figure.module.css";
import { useWindowFigureChoice } from "./window-figure-choice.ts";

/** What a stretch of a request holds, which gives it its color in the figure. */
export type FigureKind = "instructions" | "tools" | "summary" | "messages";

/** A stretch of a request in the figure: one part, or every tool of a run together. */
export interface FigurePart {
  key: string;
  kind: FigureKind;
  tokens: number;
}

/** One square of a grid: a share of a part, free room, or room that Pi keeps free. */
export interface FigureSquare {
  kind: FigureKind | "free" | "kept";
  key?: string;
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
const squareCounts = { fine: 1000, coarse: 200 };
const numberFormat = new Intl.NumberFormat();

/**
 * Draws a context window and what fills it as one figure, in the way the user picked in the
 * settings: a zoom bar, whose thin bar is the window and whose part in use opens below it to the
 * full width, or a grid, whose squares each hold the same share of the window. Each part takes the
 * color of what it holds, in the order the model reads it. The figure mirrors the list of parts
 * under it, which every keyboard and screen reader reaches, so it answers only the pointer.
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
  const choice = useWindowFigureChoice();
  const hasWindow = windowSize !== null && windowSize > 0;
  const style = hasWindow && choice !== "bar" ? choice : "bar";
  const count = style === "bar" ? 0 : squareCounts[style];
  const squareSize = hasWindow && count > 0 ? windowSize / count : 0;
  const amounts = kinds.flatMap((kind) => {
    const tokens = parts
      .filter((part) => part.kind === kind)
      .reduce((sum, part) => sum + part.tokens, 0);
    return tokens > 0 ? [{ kind, name: kindNames[kind], tokens }] : [];
  });
  const kept = hasWindow ? (reserve ?? 0) : 0;
  const free = hasWindow ? Math.max(0, windowSize - used - kept) : 0;
  const share = hasWindow ? describeShare(used, windowSize) : `${numberFormat.format(used)} tokens`;

  return (
    <div className={styles.figure} data-has-lit={litKeys.size > 0}>
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
        {style === "bar" ? (
          <ZoomBar
            parts={parts}
            share={hasWindow ? used / windowSize : null}
            keptShare={hasWindow ? kept / windowSize : 0}
            litKeys={litKeys}
          />
        ) : (
          <div className={styles.grid} data-size={style}>
            {squaresOf(parts, windowSize ?? 0, reserve, count).map((square, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: The place of a square is its identity.
                key={index}
                className={styles.square}
                data-kind={square.kind}
                data-key={square.key}
                data-lit={square.key !== undefined && litKeys.has(square.key)}
              />
            ))}
          </div>
        )}
      </div>
      <p className={styles.caption}>
        {squareSize > 0
          ? `${share}. A square is ${numberFormat.format(Math.round(squareSize))} tokens.`
          : share}
      </p>
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
    </div>
  );
}

/** Draws the small square of color that a kind of part, or a kind of room, takes in the figure. */
export function KindSwatch({ kind }: { kind: FigureSquare["kind"] }): ReactElement {
  return <span className={styles.swatch} data-kind={kind} />;
}

/**
 * Returns the squares of a grid in the order a model reads a request: each run of parts of one kind
 * takes its share of the window, and at least one square, so even a short system prompt shows. The
 * parts of a run share its squares by their size. Free room follows, and the room that Pi keeps free
 * ends the grid, unless the request already covers it.
 */
export function squaresOf(
  parts: FigurePart[],
  windowSize: number,
  reserve: number | null,
  count: number,
): FigureSquare[] {
  const size = windowSize / count;
  const squares: FigureSquare[] = [];
  for (const run of runsOf(parts)) {
    const kind = run[0]?.kind ?? "messages";
    const tokens = run.reduce((sum, part) => sum + part.tokens, 0);
    const total = Math.max(1, Math.round(tokens / size));
    let before = 0;
    for (const part of run) {
      const start = Math.round((before / tokens) * total);
      before += part.tokens;
      const end = Math.round((before / tokens) * total);
      for (let index = start; index < end; index += 1) {
        squares.push({ kind, key: part.key });
      }
    }
  }
  const kept = reserve === null ? 0 : Math.max(1, Math.round(reserve / size));
  while (squares.length < count - kept) {
    squares.push({ kind: "free" });
  }
  while (squares.length < count) {
    squares.push({ kind: "kept" });
  }
  return squares.slice(0, count);
}

/** Properties of a zoom bar. */
interface ZoomBarProps {
  parts: FigurePart[];
  share: number | null;
  keptShare: number;
  litKeys: ReadonlySet<string>;
}

// The thin bar shows how much of the window the request uses, and a funnel opens that part below it
// to the full width. Without a known window, only the opened part shows.
function ZoomBar({ parts, share, keptShare, litKeys }: ZoomBarProps): ReactElement {
  const usedPercent = Math.min(100, (share ?? 0) * 100);
  return (
    <div className={styles.zoom}>
      {share === null ? null : (
        <>
          <div
            className={styles.track}
            style={{ "--share": share, "--kept": keptShare } as CSSProperties}
          >
            <span className={styles.used} />
            {keptShare > 0 ? <span className={styles.kept} /> : null}
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
      )}
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
  );
}

// Parts of one kind that follow each other share their squares.
function runsOf(parts: FigurePart[]): FigurePart[][] {
  const runs: FigurePart[][] = [];
  for (const part of parts) {
    const run = runs.at(-1);
    if (run?.[0]?.kind === part.kind) {
      run.push(part);
    } else {
      runs.push([part]);
    }
  }
  return runs;
}

// A square or a segment names the part it belongs to, so the pointer finds the part under it.
function keyAt(target: EventTarget): string | undefined {
  return target instanceof HTMLElement
    ? target.closest<HTMLElement>("[data-key]")?.dataset.key
    : undefined;
}
