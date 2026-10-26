import type { ChatState } from "independum/api-types";

/** Returns how far the chosen thinking level sits along the levels, from 0 at the lowest to 1. */
export function thinkingRatio({ level, levels }: NonNullable<ChatState["thinking"]>): number {
  return Math.max(0, levels.indexOf(level)) / Math.max(1, levels.length - 1);
}
