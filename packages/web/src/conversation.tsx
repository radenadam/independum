import type { ModelSummary, RequestChange, RequestSummary } from "independum/api-types";
import { type ReactElement, type ReactNode, useState } from "react";
import styles from "./conversation.module.css";
import { describeThinking } from "./describe-thinking.ts";
import { modelNameOf } from "./model-name-of.ts";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceRow } from "./place-row.tsx";
import { KindSwatch } from "./window-figure.tsx";

/** A compaction among the changes of a chat. */
export type CompactionChange = Extract<RequestChange, { kind: "compaction" }>;

/** What the pointer rests on in the conversation: a request, or the compaction that the model reads. */
export type ConversationPoint = { kind: "request"; id: string } | { kind: "summary" };

/** Properties of the conversation of a chat. */
interface ConversationProps {
  requests: RequestSummary[];
  pendingChanges: RequestChange[];
  models: ModelSummary[] | undefined;
  litRequest: string | undefined;
  isSummaryLit: boolean;
  current: string | undefined;
  onPoint: (point: ConversationPoint | undefined) => void;
  onOpenRequest: (request: RequestSummary, number: number) => void;
  onOpenCompaction: (change: CompactionChange) => void;
}

// The newest requests show, and each older stretch between two compactions waits behind one row.
const newestShown = 5;
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const numberFormat = new Intl.NumberFormat();

/**
 * Draws every request of a chat, newest first, on one line, with each change of settings as a dot
 * and each compaction as a row that opens its summary, right below the request it led to. A request
 * that the model now reads only as a summary is faded, and so is every compaction but the latest.
 */
export function Conversation({
  requests,
  pendingChanges,
  models,
  litRequest,
  isSummaryLit,
  current,
  onPoint,
  onOpenRequest,
  onOpenCompaction,
}: ConversationProps): ReactElement {
  const [openStretches, setOpenStretches] = useState<ReadonlySet<string>>(new Set());
  if (requests.length === 0 && pendingChanges.length === 0) {
    return <PlaceNote>No request yet. Each reply of the model adds one.</PlaceNote>;
  }
  const latestCompaction = [...requests.flatMap((request) => request.changes), ...pendingChanges]
    .filter(isCompaction)
    .at(-1)?.entryId;
  const firstShown = requests.length - newestShown;
  const rows: ReactNode[] = [...changeRows(pendingChanges, "pending")];
  let stretch: number[] = [];
  for (let index = requests.length - 1; index >= 0; index -= 1) {
    const request = requests[index];
    if (request === undefined) {
      continue;
    }
    if (index >= firstShown) {
      rows.push(requestRow(request, index), ...changeRows(request.changes, request.id));
      continue;
    }
    stretch.push(index);
    if (index === 0 || request.changes.some(isCompaction)) {
      rows.push(...stretchRows(stretch));
      rows.push(...changeRows(request.changes.filter(isCompaction), request.id));
      stretch = [];
    }
  }
  return <div className={styles.timeline}>{rows}</div>;

  function requestRow(request: RequestSummary, index: number): ReactNode {
    const number = index + 1;
    const tokensIn = request.tokens.input + request.tokens.cacheRead + request.tokens.cacheWrite;
    return (
      <PlaceRow
        key={request.id}
        label={request.inputs.at(-1)?.label ?? "Request"}
        number={number}
        glance={`${timeFormat.format(new Date(request.timestamp))}, ${modelNameOf(models, request.provider, request.model)}, ${numberFormat.format(tokensIn)} in, ${numberFormat.format(request.tokens.output)} out`}
        isFaded={request.isSummarized}
        isCurrent={current === `request-${request.id}`}
        isLit={litRequest === request.id}
        onOpen={() => onOpenRequest(request, number)}
        onPoint={(isPointed) =>
          onPoint(isPointed ? { kind: "request", id: request.id } : undefined)
        }
      />
    );
  }

  // A stretch of older requests folds behind one row, which opens it in place.
  function stretchRows(indexes: number[]): ReactNode[] {
    const newest = indexes[0];
    const oldest = indexes.at(-1);
    const oldestRequest = oldest === undefined ? undefined : requests[oldest];
    if (newest === undefined || oldest === undefined || oldestRequest === undefined) {
      return [];
    }
    const key = oldestRequest.id;
    const isOpen = openStretches.has(key);
    const span =
      newest === oldest ? `request ${oldest + 1}` : `requests ${oldest + 1} to ${newest + 1}`;
    const isFaded = indexes.every((index) => requests[index]?.isSummarized === true);
    const toggle = (
      <PlaceRow
        key={`fold-${key}`}
        label={`${isOpen ? "Hide" : "Show"} ${span}`}
        number={null}
        amount={numberFormat.format(indexes.length)}
        isFaded={isFaded}
        onOpen={() =>
          setOpenStretches((open) => {
            const next = new Set(open);
            if (isOpen) {
              next.delete(key);
            } else {
              next.add(key);
            }
            return next;
          })
        }
      />
    );
    if (!isOpen) {
      return [toggle];
    }
    return [
      toggle,
      ...indexes.flatMap((index) => {
        const request = requests[index];
        return request === undefined
          ? []
          : [
              requestRow(request, index),
              ...changeRows(
                request.changes.filter((change) => !isCompaction(change)),
                request.id,
              ),
            ];
      }),
    ];
  }

  function changeRows(changes: RequestChange[], owner: string): ReactNode[] {
    return changes.map((change) =>
      isCompaction(change) ? (
        <PlaceRow
          key={change.entryId}
          icon={<KindSwatch kind="summary" />}
          label="Pi compacted the chat"
          glance={`${timeFormat.format(new Date(change.timestamp))}, ${describeCompaction(change).toLowerCase()}, from ${numberFormat.format(change.tokensBefore)} tokens`}
          isFaded={change.entryId !== latestCompaction}
          isCurrent={current === `compaction-${change.entryId}`}
          isLit={isSummaryLit && change.entryId === latestCompaction}
          onOpen={() => onOpenCompaction(change)}
          onPoint={(isPointed) =>
            onPoint(
              isPointed && change.entryId === latestCompaction ? { kind: "summary" } : undefined,
            )
          }
        />
      ) : (
        <p key={`${owner}-${change.kind}`} className={styles.change}>
          {describeChange(change, models)}
        </p>
      ),
    );
  }
}

/** Returns one line about a change before a request, such as Thinking effort set to high. */
export function describeChange(change: RequestChange, models: ModelSummary[] | undefined): string {
  switch (change.kind) {
    case "model":
      return `Model set to ${modelNameOf(models, change.provider, change.model)}`;
    case "effort":
      return `Thinking effort set to ${describeThinking(change.effort).toLowerCase()}`;
    case "compaction":
      return change.summarizedRequests === 0
        ? "Pi compacted the chat"
        : `Pi compacted the chat, and ${describeCompaction(change).toLowerCase()}`;
    default:
      return "Pi recorded the system prompt and the tools";
  }
}

// A compaction says which requests became its summary. Pi keeps the newest messages before it as
// they are, so the requests that end with them stay whole.
function describeCompaction(change: CompactionChange): string {
  switch (change.summarizedRequests) {
    case 0:
      return "No request became a summary";
    case 1:
      return "Request 1 became a summary";
    default:
      return `Requests 1 to ${change.summarizedRequests} became a summary`;
  }
}

function isCompaction(change: RequestChange): change is CompactionChange {
  return change.kind === "compaction";
}
