import type { ImageContent } from "@earendil-works/pi-ai";
import type { SessionEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import type {
  AttachmentSummary,
  BranchChoice,
  BranchCount,
  BranchInput,
  ComposePreview,
  InputModel,
} from "./api-types.ts";
import type { AttachmentPosition } from "./create-attachments.ts";
import { InputError } from "./create-pending-inputs.ts";

interface InputMarker {
  attachmentIds?: string[];
  fileAttachmentIds?: string[];
  attachments?: AttachmentSummary[];
  attachmentPositions?: AttachmentPosition[];
  text?: string;
  model?: InputModel;
  branch?: BranchInput;
}

interface PromptSource {
  attachmentIds: string[];
  fileAttachmentIds: string[];
  attachments: AttachmentSummary[];
  id: string;
  groupId: string;
  variantId: string;
  text: string;
  images: ImageContent[];
  model: InputModel | null;
  assistantId: string | null;
  timestamp: number;
  ending: string;
  leafId: string;
  command: ComposePreview | null;
}

interface EntryContext {
  users: string[];
  marker?: InputMarker;
  model: InputModel | null;
  command?: ComposePreview;
}

/** Saved alternatives and their most recently visited descendant paths. */
export interface ConversationBranches {
  source(id: string): PromptSource;
  summaries(): Record<string, { prompt: BranchCount; reply: BranchCount }>;
  choices(id: string, kind: "prompt" | "reply"): BranchChoice[];
  target(sourceId: string, targetId: string, kind: "prompt" | "reply"): string;
}

/** Indexes Pi entries without counting metadata as prompts or replies. */
export function createConversationBranches(manager: SessionManager): ConversationBranches {
  let revision = -1;
  let leaf: string | null = null;
  let sources = new Map<string, PromptSource>();
  let selected = new Set<string>();

  function refresh(): void {
    if (revision === manager.getEntryCount() && leaf === manager.getLeafId()) {
      return;
    }
    revision = manager.getEntryCount();
    leaf = manager.getLeafId();
    sources = new Map();
    selected = new Set(manager.getBranch().map((entry) => entry.id));
    const contexts = new Map<string, EntryContext>();
    for (const entry of manager.getEntries()) {
      const parent = entry.parentId === null ? undefined : contexts.get(entry.parentId);
      const context: EntryContext = { users: parent?.users ?? [], model: parent?.model ?? null };
      if (parent?.marker !== undefined) {
        context.marker = parent.marker;
      }
      if (parent?.command !== undefined) {
        context.command = parent.command;
      }
      if (entry.type === "model_change") {
        context.model = {
          providerId: entry.provider,
          modelId: entry.modelId,
          thinkingLevel: context.model?.thinkingLevel ?? null,
        };
      } else if (entry.type === "thinking_level_change" && context.model !== null) {
        context.model = { ...context.model, thinkingLevel: entry.thinkingLevel };
      } else if (entry.type === "custom" && entry.customType === "independum-input") {
        context.marker = entry.data as InputMarker;
        delete context.command;
      } else if (entry.type === "custom" && entry.customType === "independum-command") {
        context.command = entry.data as ComposePreview;
      } else if (entry.type === "message" && entry.message.role === "user") {
        const marker = context.marker;
        const source = sources.get(marker?.branch?.sourceUserEntryId ?? "");
        const content = entry.message.content;
        const images =
          typeof content === "string" ? [] : content.filter((part) => part.type === "image");
        sources.set(entry.id, {
          attachmentIds: marker?.attachmentIds ?? [],
          fileAttachmentIds: marker?.fileAttachmentIds ?? [],
          attachments: marker?.attachments ?? [],
          id: entry.id,
          groupId: source?.groupId ?? entry.id,
          variantId: marker?.branch?.kind === "retry" ? (source?.variantId ?? entry.id) : entry.id,
          text: marker?.text ?? contentText(content),
          images: images.filter(
            (_, index) =>
              !marker?.attachmentPositions?.some((position) => position.imageIndex === index),
          ),
          model: marker?.model ?? context.model,
          assistantId: null,
          timestamp: entry.message.timestamp,
          ending: "No reply",
          leafId: entry.id,
          command: context.command ?? null,
        });
        context.users = [...context.users, entry.id];
        delete context.marker;
        delete context.command;
      } else if (entry.type === "message" && entry.message.role === "assistant") {
        const source = sources.get(context.users.at(-1) ?? "");
        if (source !== undefined) {
          source.assistantId ??= entry.id;
          source.model = {
            providerId: entry.message.provider,
            modelId: entry.message.model,
            thinkingLevel: source.model?.thinkingLevel ?? null,
          };
          source.ending = entry.message.stopReason;
        }
      }
      contexts.set(entry.id, context);
      for (const id of context.users) {
        const source = sources.get(id);
        if (source !== undefined) {
          source.leafId = entry.id;
        }
      }
    }
  }

  function sourceOf(id: string): PromptSource {
    refresh();
    const source = sources.get(id);
    if (source === undefined) {
      throw new InputError("This saved prompt does not exist.", "promptMissing", 404);
    }
    return source;
  }

  function alternatives(source: PromptSource, kind: "prompt" | "reply"): PromptSource[] {
    const matching = [...sources.values()].filter((candidate) =>
      kind === "prompt"
        ? candidate.groupId === source.groupId
        : candidate.variantId === source.variantId,
    );
    if (kind === "reply") {
      return matching;
    }
    const variants = new Map<string, PromptSource>();
    for (const candidate of matching) {
      variants.set(candidate.variantId, candidate);
    }
    return [...variants.values()];
  }

  function countOf(source: PromptSource, kind: "prompt" | "reply"): BranchCount {
    const choices = alternatives(source, kind);
    return {
      selected:
        choices.findIndex((choice) =>
          kind === "prompt" ? choice.variantId === source.variantId : choice.id === source.id,
        ) + 1,
      count: choices.length,
    };
  }

  return {
    source: sourceOf,
    summaries() {
      refresh();
      return Object.fromEntries(
        [...sources.values()]
          .filter((source) => selected.has(source.id))
          .map((source) => [
            source.id,
            { prompt: countOf(source, "prompt"), reply: countOf(source, "reply") },
          ]),
      );
    },
    choices(id, kind) {
      const source = sourceOf(id);
      return alternatives(source, kind).map((choice) => ({
        id: kind === "prompt" ? choice.variantId : choice.id,
        label:
          kind === "prompt"
            ? choice.text.split(/\r?\n/)[0] || choice.attachments[0]?.name || "Image prompt"
            : (choice.model?.modelId ?? "Unknown model"),
        detail:
          kind === "prompt"
            ? `${choice.attachmentIds.length} attachments, ${choice.images.length} saved images`
            : `${choice.model?.thinkingLevel ?? "Unknown effort"}, ${new Date(choice.timestamp).toISOString()}, ${choice.ending}`,
        isCurrent:
          kind === "prompt" ? choice.variantId === source.variantId : choice.id === source.id,
      }));
    },
    target(sourceId, targetId, kind) {
      const source = sourceOf(sourceId);
      const matching = alternatives(source, kind).filter((choice) =>
        kind === "prompt" ? choice.variantId === targetId : choice.id === targetId,
      );
      const target = matching.at(-1);
      if (target === undefined) {
        throw new InputError(
          "This alternative does not belong to the prompt.",
          "branchMissing",
          404,
        );
      }
      if (kind === "reply") {
        return target.leafId;
      }
      const candidates = [...sources.values()].filter((choice) => choice.variantId === targetId);
      const entries = manager.getEntries();
      return candidates.reduce(
        (latest, candidate) =>
          entries.findIndex((entry) => entry.id === candidate.leafId) >
          entries.findIndex((entry) => entry.id === latest.leafId)
            ? candidate
            : latest,
        target,
      ).leafId;
    },
  };
}

/** Refuses a boundary that leaves a tool call without its result. */
export function checkBranchBoundary(entries: SessionEntry[]): void {
  const calls = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== "message") {
      continue;
    }
    if (entry.message.role === "assistant") {
      for (const part of entry.message.content) {
        if (part.type === "toolCall") {
          calls.add(part.id);
        }
      }
    } else if (entry.message.role === "toolResult") {
      if (!calls.delete(entry.message.toolCallId)) {
        throw new InputError("This branch has a tool result without its call.", "unsafeBoundary");
      }
    }
  }
  if (calls.size > 0) {
    throw new InputError("This branch has a tool call without its result.", "unsafeBoundary");
  }
}

function contentText(content: string | { type: string; text?: string }[]): string {
  return typeof content === "string"
    ? content
    : content.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("");
}
