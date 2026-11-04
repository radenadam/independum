import type { PartLink, RequestGroup, RequestPart } from "independum/api-types";
import { type ReactElement, useState } from "react";
import type { BadgeProps } from "./badge.tsx";
import { describeThinking } from "./describe-thinking.ts";
import { PlaceRow } from "./place-row.tsx";
import styles from "./request-parts.module.css";
import { type FigureKind, WindowFigure } from "./window-figure.tsx";

/** What a row of a request opens: a part, or every tool. */
export type ShownLink = PartLink | { kind: "tools" };

/** A row of a request as it shows: one part, or every tool of a run together. */
interface ShownPart {
  key: string;
  group: RequestGroup;
  label: string;
  text: string;
  tokens: number;
  link: ShownLink;
  number?: number;
  badge?: BadgeProps | undefined;
}

/** Properties of the parts of a request. */
interface RequestPartsProps {
  parts: RequestPart[];
  total: number | undefined;
  windowSize: number | null;
  reserve: number | null;
  changedTools: number;
  isSystemPromptEdited: boolean;
  current: string | undefined;
  onOpen: (key: string, link: ShownLink, part: { label: string; text: string }) => void;
}

const groupNames: Record<RequestGroup, string> = {
  instructions: "Instructions",
  tools: "Tools",
  messages: "Messages",
};
// The latest messages show, and the earlier ones wait behind one row until it opens them.
const latestShown = 5;
const numberFormat = new Intl.NumberFormat();

/**
 * Draws the parts of a request as a figure of the context window and what fills it, and a list under
 * it, both in the order the request holds them. Pointing at a part lights it up in both. The tools of
 * a run show as one row, the messages carry their place in the chat, and the earlier messages wait
 * behind one row that opens and folds them.
 */
export function RequestParts({
  parts,
  total,
  windowSize,
  reserve,
  changedTools,
  isSystemPromptEdited,
  current,
  onOpen,
}: RequestPartsProps): ReactElement {
  const [lit, setLit] = useState<string | undefined>();
  const [isAllShown, setIsAllShown] = useState(false);
  const shown = shownPartsOf(parts, changedTools, isSystemPromptEdited);
  const messages = shown.filter((part) => part.group === "messages");
  const earlier = messages.slice(0, Math.max(0, messages.length - latestShown));
  const hidden = isAllShown ? [] : earlier;
  const hiddenTokens = hidden.reduce((sum, part) => sum + part.tokens, 0);
  // The provider counts the whole request exactly, so each part shows its share of that count,
  // estimated from its length.
  const estimated = shown.reduce((sum, part) => sum + part.tokens, 0);
  const scale = total === undefined || estimated === 0 ? 1 : total / estimated;
  const amountOf = (tokens: number): string =>
    `~${numberFormat.format(Math.max(1, Math.round(tokens * scale)))}`;
  const earlierLabel = `${earlier.length} earlier ${earlier.length === 1 ? "message" : "messages"}`;
  const litKeys = new Set(
    [...(lit === "earlier" ? hidden.map((part) => part.key) : [lit]), current].filter(
      (key) => key !== undefined,
    ),
  );

  return (
    <div className={styles.parts}>
      <WindowFigure
        parts={shown.map((part) => ({
          key: part.key,
          kind: kindOf(part),
          tokens: Math.max(1, Math.round(part.tokens * scale)),
        }))}
        used={Math.round(total ?? estimated)}
        windowSize={windowSize}
        reserve={reserve}
        litKeys={litKeys}
        onLight={(key) => setLit(hidden.some((part) => part.key === key) ? "earlier" : key)}
        onOpen={(key) => {
          const part = shown.find((each) => each.key === key);
          if (hidden.some((each) => each.key === key)) {
            setIsAllShown(true);
          } else if (part !== undefined) {
            open(part);
          }
        }}
      />
      {runsOf(shown).map((run) => (
        <div key={run[0]?.key} className={styles.group}>
          <p className={styles.heading}>{groupNames[run[0]?.group ?? "messages"]}</p>
          {run.map((part) => {
            if (hidden.includes(part)) {
              return part === hidden[0] ? (
                <PlaceRow
                  key="earlier"
                  label={`Show the ${earlierLabel}`}
                  number={null}
                  amount={amountOf(hiddenTokens)}
                  isLit={lit === "earlier"}
                  onOpen={() => setIsAllShown(true)}
                  onPoint={(isPointed) => setLit(isPointed ? "earlier" : undefined)}
                />
              ) : null;
            }
            const fold =
              isAllShown && part === earlier[0] ? (
                <PlaceRow
                  key="fold"
                  label={`Hide the ${earlierLabel}`}
                  number={null}
                  onOpen={() => setIsAllShown(false)}
                />
              ) : null;
            return [
              fold,
              <PlaceRow
                key={part.key}
                label={part.label}
                number={part.number}
                badge={part.badge}
                amount={amountOf(part.tokens)}
                isCurrent={current === part.key}
                isLit={lit === part.key}
                onOpen={() => open(part)}
                onPoint={(isPointed) => setLit(isPointed ? part.key : undefined)}
              />,
            ];
          })}
        </div>
      ))}
    </div>
  );

  function open(part: ShownPart): void {
    onOpen(part.key, part.link, { label: part.label, text: part.text });
  }
}

// Tools that follow each other show as one row, because a request holds every tool that is on, and
// each message carries its place among the messages, so the order reads at a glance.
function shownPartsOf(
  parts: RequestPart[],
  changedTools: number,
  isSystemPromptEdited: boolean,
): ShownPart[] {
  const shown: ShownPart[] = [];
  let toolCount = 0;
  let messageNumber = 0;
  for (const [index, part] of parts.entries()) {
    const last = shown.at(-1);
    const isTool = part.link.kind === "tool";
    toolCount = isTool ? toolCount + 1 : 0;
    if (isTool && last?.link.kind === "tools") {
      last.tokens += part.tokens;
      last.label = `${toolCount} tools`;
      continue;
    }
    const isPrompt = part.link.kind === "systemPrompt";
    messageNumber += part.group === "messages" ? 1 : 0;
    shown.push({
      key: `${index}`,
      group: part.group,
      label: isTool ? "1 tool" : labelOf(part),
      text: part.text,
      tokens: part.tokens,
      link: isTool ? { kind: "tools" } : part.link,
      ...(part.group === "messages" ? { number: messageNumber } : {}),
      badge: isTool
        ? changedTools > 0
          ? { label: `${changedTools} edited`, tone: "quiet" }
          : undefined
        : isPrompt
          ? isSystemPromptEdited
            ? { label: "edited", tone: "quiet" }
            : { label: "built-in", tone: "signal" }
          : undefined,
    });
  }
  return shown;
}

// A part says who did what. The effort that Pi sends reads as the level the rest of the UI names,
// such as extra high.
function labelOf(part: RequestPart): string {
  return part.link.kind === "effort"
    ? `Pi set the effort to ${describeThinking(part.preview).toLowerCase()}`
    : part.label;
}

// The summary that Pi sends in place of compacted messages is a message of its own kind, so the
// figure shows how much of the window it takes.
function kindOf(part: ShownPart): FigureKind {
  if (part.group !== "messages") {
    return part.group;
  }
  return part.link.kind === "piText" && part.link.id === "compacted" ? "summary" : "messages";
}

// Parts of the same group that follow each other show under one label.
function runsOf(shown: ShownPart[]): ShownPart[][] {
  const runs: ShownPart[][] = [];
  for (const part of shown) {
    const run = runs.at(-1);
    if (run?.[0]?.group === part.group) {
      run.push(part);
    } else {
      runs.push([part]);
    }
  }
  return runs;
}
