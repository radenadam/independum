import type { ContextSummary } from "independum/api-types";
import { expect, test } from "vitest";
import { describeUsage } from "./describe-usage.ts";

function contextOf(contextTokens: number | null, contextWindow: number | null): ContextSummary {
  return { contextTokens, contextWindow } as ContextSummary;
}

test("the use of the context window shows with the size of the window", () => {
  expect(describeUsage(contextOf(4672, 1_000_000))).toBe("0.5%, 4,672 of 1,000,000 tokens");
});

test("a chat that pi has not counted yet still shows the size of its window", () => {
  expect(describeUsage(contextOf(null, 272_000))).toBe("Not counted yet, out of 272,000 tokens");
});

test("a chat with no window says that nothing is counted yet", () => {
  expect(describeUsage(contextOf(null, null))).toBe("Not counted yet");
});
