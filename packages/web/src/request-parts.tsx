import type { PartLink, PartSource, RequestGroup, RequestPart } from "independum/api-types";
import { type CSSProperties, type ReactElement, useState } from "react";
import type { BadgeProps } from "./badge.tsx";
import { PlaceRow } from "./place-row.tsx";
import styles from "./request-parts.module.css";

/** What a row of a request opens: a part, or every tool. */
export type ShownLink = PartLink | { kind: "tools" };

/** A row of a request as it shows: one part, or every tool of a run together. */
interface ShownPart {
  key: string;
  group: RequestGroup;
  source: PartSource;
  label: string;
  preview: string;
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
  changedTools: number;
  isSystemPromptEdited: boolean;
  current: string | undefined;
  onOpen: (key: string, link: ShownLink, part: { label: string; text: string }) => void;
}

const sourceNames: Record<PartSource, string> = {
  you: "You",
  model: "Model",
  tool: "Tool",
  independum: "Independum",
  pi: "Pi",
  other: "Other",
};
const groupNames: Record<RequestGroup, string> = {
  instructions: "Instructions",
  tools: "Tools",
  messages: "Messages",
};
// The latest messages show, and the earlier ones wait behind one row until it opens them.
const latestShown = 5;
const numberFormat = new Intl.NumberFormat();

/**
 * Draws the parts of a request as a bar of what fills it and a list under it, both in the order
 * the request holds them. Pointing at a part lights it up in both. The tools of a run show as one
 * row, the messages carry their place in the chat, and the earlier messages wait behind one row
 * that opens and folds them.
 */
export function RequestParts({
  parts,
  total,
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

  return (
    <div className={styles.parts}>
      <div className={styles.bar}>
        {shown.map((part) => {
          if (hidden.includes(part)) {
            return part === hidden[0] ? (
              <button
                key="earlier"
                type="button"
                className={styles.segment}
                style={{ "--tokens": hiddenTokens } as CSSProperties}
                aria-label={`Show the ${earlierLabel}`}
                onClick={() => setIsAllShown(true)}
              />
            ) : null;
          }
          return (
            <button
              key={part.key}
              type="button"
              className={styles.segment}
              style={{ "--tokens": part.tokens } as CSSProperties}
              data-lit={lit === part.key || current === part.key}
              aria-label={`${sourceNames[part.source]}, ${part.label}`}
              onClick={() => open(part)}
              onPointerEnter={() => setLit(part.key)}
              onPointerLeave={() => setLit(undefined)}
            />
          );
        })}
      </div>
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
                  onOpen={() => setIsAllShown(true)}
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
                source={sourceNames[part.source]}
                glance={part.preview}
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
  let toolNames: string[] = [];
  let messageNumber = 0;
  for (const [index, part] of parts.entries()) {
    const last = shown.at(-1);
    const isTool = part.link.kind === "tool";
    toolNames = isTool ? [...toolNames, part.label] : [];
    if (isTool && last?.link.kind === "tools") {
      last.tokens += part.tokens;
      last.label = `${toolNames.length} tools`;
      last.preview = toolNames.join(", ");
      continue;
    }
    const isPrompt = part.link.kind === "systemPrompt";
    messageNumber += part.group === "messages" ? 1 : 0;
    shown.push({
      key: `${index}`,
      group: part.group,
      source: part.source,
      label: isTool ? "1 tool" : part.label,
      preview: isTool ? part.label : part.preview,
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
