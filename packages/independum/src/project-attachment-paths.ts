import { basename, dirname, join, resolve } from "node:path";
import type { AgentSession, SessionEntry } from "@earendil-works/pi-coding-agent";

type AgentMessage = AgentSession["messages"][number];

interface AttachmentInput {
  version?: number;
  attachmentIds?: string[];
}

/** Maps the exact quoted legacy store path of one retained attachment to the current store. */
export function projectAttachmentText(text: string, id: string, directory: string): string {
  const state = resolve(directory);
  const before = JSON.stringify(
    join(dirname(state), `${basename(state)}-attachments`, id, "content"),
  );
  const after = JSON.stringify(join(state, "attachments", id, "content"));
  return text.replaceAll(before, after);
}

/** Projects retained attachment paths only inside canonical input marked by Independum. */
export function projectAttachmentPaths(
  messages: AgentMessage[],
  entries: SessionEntry[],
  directory: string,
): AgentMessage[] {
  const owned = new Map<string, string[]>();
  let input: AttachmentInput | undefined;
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === "independum-input") {
      input = entry.data as AttachmentInput | undefined;
    } else if (entry.type === "message" && entry.message.role === "user") {
      if (input?.version === 1 && Array.isArray(input.attachmentIds)) {
        owned.set(
          JSON.stringify(entry.message),
          input.attachmentIds.filter(
            (id) =>
              typeof id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id),
          ),
        );
      }
      input = undefined;
    }
  }
  return messages.map((message) => {
    if (message.role !== "user") {
      return message;
    }
    const ids = owned.get(JSON.stringify(message)) ?? [];
    if (ids.length === 0) {
      return message;
    }
    function project(text: string): string {
      let projected = text;
      for (const id of ids) {
        projected = projectAttachmentText(projected, id, directory);
      }
      return projected;
    }
    return {
      ...message,
      content:
        typeof message.content === "string"
          ? project(message.content)
          : message.content.map((part) =>
              part.type === "text" ? { ...part, text: project(part.text) } : part,
            ),
    };
  });
}
