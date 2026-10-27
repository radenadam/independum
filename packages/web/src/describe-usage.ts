import type { ContextSummary } from "independum/api-types";

const numberFormat = new Intl.NumberFormat();

/**
 * Returns how much of its context window the open chat uses, such as 0.3%, 374 tokens, or that Pi
 * has not counted it yet, which it does after a reply.
 */
export function describeUsage(context: ContextSummary | undefined): string {
  const tokens = context?.contextTokens ?? null;
  const window = context?.contextWindow ?? null;
  if (tokens === null || window === null || window === 0) {
    return "Not counted yet";
  }
  const percent = (tokens / window) * 100;
  const shown = percent < 10 ? percent.toFixed(1) : String(Math.round(percent));
  return `${shown}%, ${numberFormat.format(tokens)} tokens`;
}

/** Returns how full the context window of the open chat is, from 0 to 1, or 0 before Pi counts it. */
export function usageRatio(context: ContextSummary | undefined): number {
  const tokens = context?.contextTokens ?? null;
  const window = context?.contextWindow ?? null;
  return tokens === null || window === null || window === 0 ? 0 : Math.min(1, tokens / window);
}
