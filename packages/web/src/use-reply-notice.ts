import type { ChatMessage, ProjectSummary } from "independum/api-types";
import { useEffect, useRef } from "react";
import { notify } from "./notification-choice.ts";

/** A reply that ended in a chat, as the server tells the UI about it. */
export interface EndedReply {
  chatId: string;
  reply: ChatMessage | null;
}

// A notification holds the start of a reply, up to this many characters, ending on a whole word.
const longestStart = 140;

// It holds the title of the chat and the start of the reply, or why it failed, and a click on
// it opens the chat.
/**
 * Tells the user through the system when a reply ends where they do not see it: in a chat that
 * is not open, or in the open chat while Independum is not in front.
 */
export function useReplyNotice(
  ended: EndedReply | undefined,
  projects: ProjectSummary[],
  openId: string | null,
  onOpen: (id: string) => void,
): void {
  const told = useRef<EndedReply | undefined>(undefined);
  useEffect(() => {
    if (ended === undefined || ended === told.current) {
      return;
    }
    told.current = ended;
    const title =
      projects.flatMap((project) => project.chats).find((chat) => chat.id === ended.chatId)
        ?.title ?? "Independum";
    notify(
      title,
      describeReplyEnd(ended.reply ?? undefined),
      ended.chatId,
      ended.chatId === openId,
      () => onOpen(ended.chatId),
    );
  });
}

/** Returns what a notification says about a reply that ended: the start of its text, or why it failed. */
export function describeReplyEnd(reply: ChatMessage | undefined): string {
  if (reply?.isStopped) {
    return "Stopped";
  }
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
