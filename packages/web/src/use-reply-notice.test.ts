import type { ChatMessage } from "independum/api-types";
import { expect, test, vi } from "vitest";
import { notify } from "./notification-choice.ts";
import { renderHook } from "./render-hook.ts";
import { describeReplyEnd, useReplyNotice } from "./use-reply-notice.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./notification-choice.ts", () => ({ notify: vi.fn() }));

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

test("a stopped reply reads as stopped instead of failed", () => {
  expect(describeReplyEnd({ ...replyOf("Partial reply.", "Stopped"), isStopped: true })).toBe(
    "Stopped",
  );
});

test("a reply with only tool calls says that it is done", () => {
  expect(describeReplyEnd(replyOf(""))).toBe("The reply is done.");
});

test("a notice names its chat by the short title of the summary, never by its whole line", () => {
  const ended = { chatId: "chat", reply: replyOf("Done.") };
  const projects = [
    {
      folder: "project",
      name: "project",
      chats: [
        {
          id: "chat",
          title: "Summarize the attached notes and list every open\u2026",
          fullTitle:
            "Summarize the attached notes and list every open question they raise about the release plan.",
          modified: 0,
          isPinned: false,
        },
      ],
    },
  ];
  const view = renderHook(() => useReplyNotice(ended, projects, null, vi.fn()));
  view.render();
  expect(vi.mocked(notify).mock.calls[0]?.[0]).toBe(
    "Summarize the attached notes and list every open\u2026",
  );
  view.unmount();
});
