import type { ContextSummary } from "independum/api-types";

const numberFormat = new Intl.NumberFormat();

/**
 * Returns how much of its context window the open chat uses and how big the window is, such as
 * 0.3%, 374 of 272,000 tokens. Pi counts the use after a reply, and knows the window once a model
 * is chosen.
 */
export function describeUsage(context: ContextSummary | undefined): string {
  const tokens = context?.contextTokens ?? null;
  const window = context?.contextWindow ?? null;
  if (window === null || window === 0) {
    return "Not counted yet";
  }
  if (tokens === null) {
    return `Not counted yet, out of ${numberFormat.format(window)} tokens`;
  }
  return describeShare(tokens, window);
}

/** Returns how much of a context window some tokens take, such as 0.3%, 374 of 272,000 tokens. */
export function describeShare(tokens: number, windowSize: number): string {
  const percent = (tokens / windowSize) * 100;
  const shown = percent < 10 ? percent.toFixed(1) : String(Math.round(percent));
  return `${shown}%, ${numberFormat.format(tokens)} of ${numberFormat.format(windowSize)} tokens`;
}

/** Returns how full the context window of the open chat is, from 0 to 1, or 0 before Pi counts it. */
export function usageRatio(context: ContextSummary | undefined): number {
  const tokens = context?.contextTokens ?? null;
  const window = context?.contextWindow ?? null;
  return tokens === null || window === null || window === 0 ? 0 : Math.min(1, tokens / window);
}
