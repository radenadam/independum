import type { ChatMessage } from "independum/api-types";
import { expect, test } from "vitest";
import { describeReplyEnd } from "./use-reply-notice.ts";

function replyOf(text: string, error: string | null = null): ChatMessage {
  return {
    role: "assistant",
    parts: [{ type: "text", text }],
    error,
    timestamp: 0,
    durationMs: null,
    commandEnd: null,
  };
}

test("a done reply reads as the first line of its text", () => {
  expect(describeReplyEnd(replyOf("All six tools ran.\nThe test left a folder."))).toBe(
    "All six tools ran.",
  );
});

test("a long first line ends on a whole word", () => {
  const notice = describeReplyEnd(replyOf("word ".repeat(60)));
  expect(notice.length).toBeLessThanOrEqual(140);
  expect(notice.endsWith("word")).toBe(true);
});

test("a failed reply says why", () => {
  expect(describeReplyEnd(replyOf("", "The model is busy."))).toBe(
    "The reply failed. The model is busy.",
  );
});

test("a reply with only tool calls says that it is done", () => {
  expect(describeReplyEnd(replyOf(""))).toBe("The reply is done.");
});
