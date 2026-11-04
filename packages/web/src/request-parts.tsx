import type { PartLink, PartSource, RequestGroup, RequestPart } from "independum/api-types";
import { type CSSProperties, type ReactElement, useState } from "react";
import { PlaceRow } from "./place-row.tsx";
import styles from "./request-parts.module.css";

/** What a row of a request opens: a part, every tool, or nothing more when it shows earlier rows. */
export type ShownLink = PartLink | { kind: "tools" };

/** A row of a request as it shows: one part, or every tool of a run together. */
interface ShownPart {
  key: string;
  group: RequestGroup;
  source: PartSource;
  label: string;
  text: string;
  tokens: number;
  link: ShownLink;
  tag?: string | undefined;
  isTagMarked?: boolean;
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

/** The name of who put a part of a request there, as a row shows it. */
export const sourceNames: Record<PartSource, string> = {
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
 * Draws the parts of the last request as a bar of what fills it and a list under it, both in the
 * order the request holds them. Pointing at a part lights it up in both. The tools of a run show as
 * one row, and the earlier messages wait behind one row.
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
  const hidden = isAllShown ? [] : messages.slice(0, Math.max(0, messages.length - latestShown));
  // The provider counts the whole request exactly, so each part shows its share of that count,
  // estimated from its length.
  const estimated = shown.reduce((sum, part) => sum + part.tokens, 0);
  const scale = total === undefined || estimated === 0 ? 1 : total / estimated;
  const tokensOf = (part: ShownPart): string =>
    `~${numberFormat.format(Math.max(1, Math.round(part.tokens * scale)))}`;

  return (
    <div className={styles.parts}>
      <div className={styles.bar}>
        {shown.map((part) => (
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
        ))}
      </div>
      <div className={styles.list}>
        {shown.map((part, index) => {
          const isFirstOfGroup = shown[index - 1]?.group !== part.group;
          const heading = isFirstOfGroup ? (
            <p key={`${part.key}-heading`} className={styles.heading}>
              {groupNames[part.group]}
            </p>
          ) : null;
          if (hidden.includes(part)) {
            return part === hidden[0]
              ? [
                  heading,
                  <PlaceRow
                    key="earlier"
                    label={`${hidden.length} earlier ${hidden.length === 1 ? "part" : "parts"}`}
                    amount={`~${numberFormat.format(Math.round(hidden.reduce((sum, each) => sum + each.tokens, 0) * scale))}`}
                    onOpen={() => setIsAllShown(true)}
                  />,
                ]
              : null;
          }
          return [
            heading,
            <PlaceRow
              key={part.key}
              source={sourceNames[part.source]}
              label={part.label}
              tag={part.tag}
              isTagMarked={part.isTagMarked ?? false}
              amount={tokensOf(part)}
              isCurrent={current === part.key}
              isLit={lit === part.key}
              onOpen={() => open(part)}
              onPoint={(isPointed) => setLit(isPointed ? part.key : undefined)}
            />,
          ];
        })}
      </div>
    </div>
  );

  function open(part: ShownPart): void {
    onOpen(part.key, part.link, { label: part.label, text: part.text });
  }
}

// Tools that follow each other show as one row, because a request holds every tool that is on.
function shownPartsOf(
  parts: RequestPart[],
  changedTools: number,
  isSystemPromptEdited: boolean,
): ShownPart[] {
  const shown: ShownPart[] = [];
  let toolCount = 0;
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
    shown.push({
      key: `${index}`,
      group: part.group,
      source: part.source,
      label: isTool ? "1 tool" : part.label,
      text: part.text,
      tokens: part.tokens,
      link: isTool ? { kind: "tools" } : part.link,
      tag: isTool
        ? changedTools > 0
          ? `${changedTools} edited`
          : undefined
        : isPrompt
          ? isSystemPromptEdited
            ? "edited"
            : "built-in"
          : undefined,
      isTagMarked: (isTool && changedTools > 0) || (isPrompt && isSystemPromptEdited),
    });
  }
  return shown;
}
