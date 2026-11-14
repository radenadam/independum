import { basename, dirname, join, resolve } from "node:path";
import type { AgentSession, SessionEntry } from "@earendil-works/pi-coding-agent";
import type { AttachmentPosition } from "./create-attachments.ts";

type AgentMessage = AgentSession["messages"][number];

interface AttachmentInput {
  version?: number;
  attachmentPositions?: AttachmentPosition[];
}

/** Maps the legacy store path of one retained attachment in its marked text to the current store. */
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
  const owned = new Map<string, AttachmentPosition[]>();
  let input: AttachmentInput | undefined;
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === "independum-input") {
      input = entry.data as AttachmentInput | undefined;
    } else if (entry.type === "message" && entry.message.role === "user") {
      if (input?.version === 1 && Array.isArray(input.attachmentPositions)) {
        owned.set(JSON.stringify(entry.message), input.attachmentPositions);
      }
      input = undefined;
    }
  }
  return messages.map((message) => {
    if (message.role !== "user") {
      return message;
    }
    const positions = owned.get(JSON.stringify(message)) ?? [];
    if (positions.length === 0) {
      return message;
    }
    let offset = 0;
    function project(text: string): string {
      const start = offset;
      offset += text.length;
      let projected = text;
      // Saved offsets describe the original text, so replacements run from its end.
      for (const position of [...positions].sort((left, right) => right.start - left.start)) {
        if (
          !Number.isSafeInteger(position.start) ||
          !Number.isSafeInteger(position.end) ||
          position.start < start ||
          position.end > offset ||
          position.start > position.end ||
          !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(position.id)
        ) {
          continue;
        }
        const from = position.start - start;
        const to = position.end - start;
        projected =
          projected.slice(0, from) +
          projectAttachmentText(projected.slice(from, to), position.id, directory) +
          projected.slice(to);
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
