import type { ChatMessage, ChatState } from "independum/api-types";
import { useEffect, useRef } from "react";
import { notify } from "./notification-choice.ts";

// A notification holds the start of a reply, up to this many characters, ending on a whole word.
const longestStart = 140;

/**
 * Tells the user through the system when a reply of the open chat ends while Independum is not in
 * front, with the title of the chat and the start of the reply, or why it failed.
 */
export function useReplyNotice(chat: ChatState | undefined, title: string): void {
  const wasReplying = useRef(false);
  useEffect(() => {
    const isReplying = chat?.isReplying ?? false;
    if (wasReplying.current && !isReplying && chat !== undefined) {
      notify(
        title,
        describeReplyEnd(chat.messages.findLast((message) => message.role === "assistant")),
        chat.id ?? "chat",
      );
    }
    wasReplying.current = isReplying;
  });
}

/** Returns what a notification says about a reply that ended: the start of its text, or why it failed. */
export function describeReplyEnd(reply: ChatMessage | undefined): string {
  if (reply?.error) {
    return `The reply failed. ${reply.error}`;
  }
  const text =
    reply?.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n") ?? "";
  const line = text.trim().split("\n")[0] ?? "";
  if (line === "") {
    return "The reply is done.";
  }
  if (line.length <= longestStart) {
    return line;
  }
  const cut = line.slice(0, longestStart);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 1));
}
