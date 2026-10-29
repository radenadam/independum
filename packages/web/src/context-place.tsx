import type { ContextSummary } from "independum/api-types";
import type { ReactElement, ReactNode } from "react";
import { CodeWell } from "./code-well.tsx";
import styles from "./context-place.module.css";
import { describeUsage } from "./describe-usage.ts";
import { Disclosure } from "./disclosure.tsx";
import { PlaceFrame, PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";

/** Properties of the Context place. */
interface ContextPlaceProps {
  context: ContextSummary | undefined;
}

const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * Draws what the model of the open chat works with: how full its context window is, the tokens and
 * the cost so far, the entries that Pi saved, and the exact request it sent last.
 */
export function ContextPlace({ context }: ContextPlaceProps): ReactElement {
  if (context === undefined) {
    return (
      <PlaceFrame>
        <PlaceNote>Loading the context.</PlaceNote>
      </PlaceFrame>
    );
  }
  const request =
    context.lastRequest === null ? undefined : JSON.stringify(context.lastRequest, null, 2);

  return (
    <PlaceFrame>
      <dl className={styles.facts}>
        {factsOf(context).map(([label, value]) => (
          <div key={label} className={styles.fact}>
            <dt className={styles.label}>{label}</dt>
            <dd className={styles.value}>{value}</dd>
          </div>
        ))}
      </dl>
      <PlaceSection heading="Raw messages">
        {context.entries.length === 0 ? (
          <PlaceNote>Pi saves the chat with its first message.</PlaceNote>
        ) : (
          <ul className={styles.entries}>
            {context.entries.map((entry) => (
              <li key={entry.id}>
                <Disclosure
                  label={
                    <span className={styles.entry}>
                      <span className={styles.kind}>{entry.role ?? entry.type}</span>
                      <code className={styles.id}>{entry.id}</code>
                      <time className={styles.time} dateTime={entry.timestamp}>
                        {dateFormat.format(new Date(entry.timestamp))}
                      </time>
                    </span>
                  }
                >
                  <CodeWell code={JSON.stringify(entry.data, null, 2)} copyLabel="Copy entry" />
                </Disclosure>
              </li>
            ))}
          </ul>
        )}
      </PlaceSection>
      <PlaceSection heading="Last request">
        {request === undefined ? (
          <PlaceNote>No request yet since this chat opened.</PlaceNote>
        ) : (
          <Disclosure label="The exact request">
            <CodeWell code={request} copyLabel="Copy request" />
          </Disclosure>
        )}
        {context.cacheWarmings === 0 ? null : (
          <PlaceNote>
            Pi sent it again {numberFormat.format(context.cacheWarmings)}{" "}
            {context.cacheWarmings === 1 ? "time" : "times"} with a limit of one output token, to
            keep the prompt cache of the provider warm.
          </PlaceNote>
        )}
      </PlaceSection>
    </PlaceFrame>
  );
}

function factsOf(context: ContextSummary): [string, ReactNode][] {
  const { tokens } = context;
  return [
    ["Chat", <code key="chat">{context.chatId ?? "None yet"}</code>],
    ["Messages", `${context.userMessages} sent, ${context.assistantMessages} replies`],
    ["Provider", context.provider ?? "None chosen"],
    ["Model", <code key="model">{context.model ?? "None chosen"}</code>],
    ["Context window", tokensOf(context.contextWindow)],
    ["Context used", describeUsage(context)],
    ["Input tokens", tokensOf(tokens.input)],
    ["Output tokens", tokensOf(tokens.output)],
    ["Reasoning tokens", tokensOf(tokens.reasoning)],
    ["Cache tokens", `${tokensOf(tokens.cacheRead)} read, ${tokensOf(tokens.cacheWrite)} written`],
    ["Tool calls", numberFormat.format(context.toolCalls)],
    ["Total cost", costOf(context.cost)],
    ["Created", dateOf(context.created)],
    ["Last activity", dateOf(context.lastActivity)],
  ];
}

function tokensOf(count: number | null): string {
  return count === null ? "Unknown" : numberFormat.format(count);
}

// A small cost keeps more digits, so a cheap chat does not read as free.
function costOf(cost: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cost > 0 && cost < 0.01 ? 4 : 2,
  }).format(cost);
}

function dateOf(timestamp: string | null): string {
  return timestamp === null ? "Not saved yet" : dateFormat.format(new Date(timestamp));
}
