import type {
  ModelSummary,
  PartLink,
  RequestChange,
  RequestGroup,
  RequestPart,
  RequestSummary,
} from "independum/api-types";
import { type ReactElement, useState } from "react";
import type { BadgeProps } from "./badge.tsx";
import styles from "./context-parts.module.css";
import { type CompactionChange, Conversation, type ConversationPoint } from "./conversation.tsx";
import { PlaceBox } from "./place-box.tsx";
import { PlaceRow } from "./place-row.tsx";
import { type FigureKind, KindSwatch, WindowFigure } from "./window-figure.tsx";

/** What a part of the context opens: a part of the request, every tool, a request, or a compaction. */
export type ShownLink =
  | PartLink
  | { kind: "tools" }
  | { kind: "request"; id: string }
  | { kind: "compaction"; id: string };

/** A part of a request as it shows: one part, or every tool of a run together. */
interface ShownPart {
  key: string;
  group: RequestGroup;
  label: string;
  text: string;
  tokens: number;
  link: ShownLink;
  badge?: BadgeProps | undefined;
}

/** Properties of the parts of the context. */
interface ContextPartsProps {
  parts: RequestPart[];
  total: number | undefined;
  windowSize: number | null;
  reserve: number | null;
  requests: RequestSummary[];
  pendingChanges: RequestChange[];
  models: ModelSummary[] | undefined;
  changedTools: number;
  isSystemPromptEdited: boolean;
  current: string | undefined;
  onOpen: (key: string, link: ShownLink, part: { label: string; text: string }) => void;
}

/** What the pointer rests on: a part of the figure or of the box, or a row of the conversation. */
type Pointed = { kind: "part"; key: string } | ConversationPoint;

const numberFormat = new Intl.NumberFormat();

/**
 * Draws the context of a chat: a figure of the context window and what fills it, the instructions
 * and the tools in one box, and the conversation, newest first. Pointing at a part, a request, or the
 * latest compaction lights up its parts in the figure and its row under it.
 */
export function ContextParts({
  parts,
  total,
  windowSize,
  reserve,
  requests,
  pendingChanges,
  models,
  changedTools,
  isSystemPromptEdited,
  current,
  onOpen,
}: ContextPartsProps): ReactElement {
  const [pointed, setPointed] = useState<Pointed | undefined>();
  const shown = shownPartsOf(parts, changedTools, isSystemPromptEdited);
  const setup = shown.filter((part) => part.group !== "messages");
  // The provider counts the whole request exactly, so each part shows its share of that count,
  // estimated from its length.
  const estimated = shown.reduce((sum, part) => sum + part.tokens, 0);
  const scale = total === undefined || estimated === 0 ? 1 : total / estimated;
  const tokensOf = (part: ShownPart): number => Math.max(1, Math.round(part.tokens * scale));
  const requestOfEntry = new Map(
    requests.flatMap((request) =>
      [...request.inputs.map((input) => input.entryId), request.id].map((id) => [id, request.id]),
    ),
  );
  const litKeys = new Set([
    ...shown.filter((part) => isLit(part)).map((part) => part.key),
    ...(current === undefined ? [] : [current]),
  ]);
  const litRequest =
    pointed?.kind === "request"
      ? pointed.id
      : pointed?.kind === "part"
        ? requestOfEntry.get(entryOf(shown.find((part) => part.key === pointed.key)) ?? "")
        : undefined;

  return (
    <div className={styles.parts}>
      <WindowFigure
        parts={shown.map((part) => ({ key: part.key, kind: kindOf(part), tokens: tokensOf(part) }))}
        used={Math.round(total ?? estimated)}
        windowSize={windowSize}
        reserve={reserve}
        litKeys={litKeys}
        onLight={(key) => setPointed(key === undefined ? undefined : { kind: "part", key })}
        onOpen={(key) => {
          const part = shown.find((each) => each.key === key);
          const request = requestOfEntry.get(entryOf(part) ?? "");
          if (part !== undefined && (part.group !== "messages" || part.link.kind === "addedFact")) {
            open(part);
          } else if (request !== undefined) {
            openRequest(request);
          }
        }}
      />
      {setup.length === 0 ? null : (
        <div className={styles.group}>
          <p className={styles.heading}>Instructions and tools</p>
          <PlaceBox>
            {setup.map((part) => (
              <PlaceRow
                key={part.key}
                icon={<KindSwatch kind={kindOf(part)} />}
                label={part.label}
                badge={part.badge}
                amount={`~${numberFormat.format(tokensOf(part))}`}
                isBoxed
                isCurrent={current === part.key}
                isLit={pointed?.kind === "part" && pointed.key === part.key}
                onOpen={() => open(part)}
                onPoint={(isPointed) =>
                  setPointed(isPointed ? { kind: "part", key: part.key } : undefined)
                }
              />
            ))}
          </PlaceBox>
        </div>
      )}
      <div className={styles.group}>
        <p className={styles.heading}>Conversation</p>
        <Conversation
          requests={requests}
          pendingChanges={pendingChanges}
          models={models}
          litRequest={litRequest}
          isSummaryLit={pointed?.kind === "summary"}
          current={current}
          onPoint={setPointed}
          onOpenRequest={(request) => openRequest(request.id)}
          onOpenCompaction={openCompaction}
        />
      </div>
    </div>
  );

  function isLit(part: ShownPart): boolean {
    switch (pointed?.kind) {
      case "part":
        return pointed.key === part.key;
      case "request": {
        const entry = entryOf(part);
        return entry !== undefined && requestOfEntry.get(entry) === pointed.id;
      }
      case "summary":
        return kindOf(part) === "summary";
      default:
        return false;
    }
  }

  function open(part: ShownPart): void {
    onOpen(part.key, part.link, { label: part.label, text: part.text });
  }

  function openRequest(id: string): void {
    const number = requests.findIndex((request) => request.id === id) + 1;
    onOpen(`request-${id}`, { kind: "request", id }, { label: `Request ${number}`, text: "" });
  }

  function openCompaction(change: CompactionChange): void {
    onOpen(
      `compaction-${change.entryId}`,
      { kind: "compaction", id: change.entryId },
      { label: "Compaction", text: "" },
    );
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
      label: isTool ? "1 tool" : part.label,
      text: part.text,
      tokens: part.tokens,
      link: isTool ? { kind: "tools" } : part.link,
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

// The summary that Pi sends in place of compacted messages is a message of its own kind, so the
// figure shows how much of the window it takes.
function kindOf(part: ShownPart): FigureKind {
  if (part.group !== "messages") {
    return part.group;
  }
  return part.link.kind === "piText" && part.link.id === "compacted" ? "summary" : "messages";
}

// A message of the request names the saved entry it came from, which belongs to one request.
function entryOf(part: ShownPart | undefined): string | undefined {
  return part?.link.kind === "entry"
    ? part.link.id
    : part?.link.kind === "addedFact"
      ? part.link.entryId
      : undefined;
}
