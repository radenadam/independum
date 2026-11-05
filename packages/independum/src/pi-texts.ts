import type { PiTextSummary } from "./api-types.ts";
import { stringsOf } from "./strings-of.ts";

/** A text that Pi sends to the model, with when it sends it and what its slots hold. */
interface PiText {
  id: string;
  group: string;
  condition: string;
  text: string;
  slots: Record<string, string>;
}

// Installed-source checks keep this inventory tied to Pi.
const toolName = "The name of the tool that the model called.";

/** Every text that Pi can send to the model while Independum runs it, in the order shown. */
export const piTexts: PiText[] = [
  {
    id: "imageConversionFailed",
    group: "Images",
    condition: "When Pi cannot convert an image to a supported inline format.",
    text: "[Image omitted: could not be converted to a supported inline image format.]",
    slots: {},
  },
  {
    id: "imageResizeFailed",
    group: "Images",
    condition: "When Pi cannot resize an image below its inline size limit.",
    text: "[Image omitted: could not be resized below the inline image size limit.]",
    slots: {},
  },
  {
    id: "thinkingEffort",
    group: "In the chat, with thinking",
    condition:
      "Pi adds native system blocks with this field for thinking effort on compatible models. The raw request shows their exact values. Turning thinking off is coupled to thinking behavior and has no independent marker switch.",
    text: "output_config",
    slots: {},
  },
  {
    id: "emptySystemFallback",
    group: "Before the system prompt",
    condition:
      "The Codex adapter substitutes this text when the system prompt is empty. Independent omission is unavailable.",
    text: "You are a helpful assistant.",
    slots: {},
  },
  {
    id: "claudeCode",
    group: "Before the system prompt",
    condition:
      "Every request to Anthropic with a Claude subscription login. Pi sends it as a block of its own before the system prompt.",
    text: "You are Claude Code, Anthropic's official CLI for Claude.",
    slots: {},
  },
  {
    id: "placeholderTool",
    group: "Tools",
    condition:
      "Requests to Anthropic models that can change tools in the middle of a chat, such as claude-haiku-5-5, while a tool is on. Pi adds a tool named __pi_deferred_placeholder__ with this description.",
    text: "Reserved placeholder. Never available. Never call this.",
    slots: {},
  },
  {
    id: "promptUpdated",
    group: "In the chat, after a change",
    condition:
      "When the system prompt changes in an open chat, for models that take system messages in the middle of a chat, such as claude-haiku-5-5 and gpt-6-luna. Other models get the whole new prompt at the start instead.",
    text: 'Updated system prompt section "{name}":\n\n{text}',
    slots: {
      name: "The section that changed, such as preamble for the prompt of Independum or cwd for the folder.",
      text: "The new text of the section.",
    },
  },
  {
    id: "promptRemoved",
    group: "In the chat, after a change",
    condition:
      "When a section of the system prompt goes away in an open chat, for the same models.",
    text: 'Removed system prompt section "{name}".',
    slots: { name: "The section that went away." },
  },
  {
    id: "toolsUpdated",
    group: "In the chat, after a change",
    condition:
      "For OpenAI models such as gpt-6-luna, before tools that change in an open chat, such as a tool turned on or a tool with edited texts.",
    text: "This is an incremental tools update. Previously declared tools remain available unless explicitly marked unavailable. A tool declared again here is available again, and its latest definition replaces the earlier one.",
    slots: {},
  },
  {
    id: "stillUnavailable",
    group: "In the chat, after a change",
    condition: "On the next line of that update, while a tool that was turned off stays off.",
    text: "Still unavailable: {names}.",
    slots: { names: "The tools that are off." },
  },
  {
    id: "toolsRemoved",
    group: "In the chat, after a change",
    condition: "For the same models, when a tool is turned off in an open chat.",
    text: "The following tools are no longer available. Do not call them:\n- {name}",
    slots: { name: "Each tool that was turned off, one a line." },
  },
  {
    id: "toolNotFound",
    group: "Tool results",
    condition: "When the model calls a tool that is off or does not exist.",
    text: "Tool {name} not found",
    slots: { name: toolName },
  },
  {
    id: "invalidArguments",
    group: "Tool results",
    condition: "When the arguments of a tool call are not a JSON object.",
    text: 'Invalid arguments for tool "{name}": {error}\n\nReceived arguments:\n{arguments}',
    slots: {
      name: toolName,
      error: "Why the arguments could not be read.",
      arguments: "The arguments as the model wrote them.",
    },
  },
  {
    id: "validationFailed",
    group: "Tool results",
    condition:
      "When the arguments do not match the parameters of the tool. Pi first turns values into the right type where it can, without saying so.",
    text: 'Validation failed for tool "{name}":\n  - {path}: {message}\n\nReceived arguments:\n{arguments}',
    slots: {
      name: toolName,
      path: "The parameter that is wrong, one a line.",
      message: "What is wrong with it.",
      arguments: "The arguments as the model wrote them.",
    },
  },
  {
    id: "outputLimit",
    group: "Tool results",
    condition:
      "When a reply reaches the output token limit of the model while it writes a tool call.",
    text: 'Tool call "{name}" was not executed: the response hit the output token limit, so its arguments may be truncated. Re-issue the tool call with complete arguments.',
    slots: { name: toolName },
  },
  {
    id: "aborted",
    group: "Tool results",
    condition: "When the user stops a reply while a tool call waits to run.",
    text: "Operation aborted",
    slots: {},
  },
  {
    id: "noResult",
    group: "Tool results",
    condition:
      "For a tool call that has no result, such as one that never started after a stop. Pi adds it to the request only and never saves it in the chat.",
    text: "No result provided",
    slots: {},
  },
  {
    id: "attachedImage",
    group: "Images",
    condition: "When a tool result holds only images.",
    text: "(see attached image)",
    slots: {},
  },
  {
    id: "noToolOutput",
    group: "Images",
    condition: "When a tool result for an OpenAI model holds neither text nor images.",
    text: "(no tool output)",
    slots: {},
  },
  {
    id: "imageOmitted",
    group: "Images",
    condition: "When a message holds an image and the model cannot take images.",
    text: "(image omitted: model does not support images)",
    slots: {},
  },
  {
    id: "toolImageOmitted",
    group: "Images",
    condition: "When a tool result holds an image and the model cannot take images.",
    text: "(tool image omitted: model does not support images)",
    slots: {},
  },
  {
    id: "errorImages",
    group: "Images",
    condition:
      "When a failed tool result holds images. Pi moves them after the tool results, with this line before them.",
    text: "Images from the error result of tool call {id} ({name}):",
    slots: { id: "The id of the tool call.", name: toolName },
  },
  {
    id: "errorImageMoved",
    group: "Images",
    condition: "In the failed tool result, in place of each image that Pi moved.",
    text: "(image attached after the tool results)",
    slots: {},
  },
  {
    id: "imageResized",
    group: "Images",
    condition: "When Pi makes an image smaller to fit what the model accepts.",
    text: "[Image: original {width}x{height}, displayed at {shownWidth}x{shownHeight}. Multiply coordinates by {scale} to map to original image.]",
    slots: {
      width: "The width of the image.",
      height: "The height of the image.",
      shownWidth: "The width that the model sees.",
      shownHeight: "The height that the model sees.",
      scale: "How much smaller the image became.",
    },
  },
  {
    id: "imageConverted",
    group: "Images",
    condition: "When Pi turns an image into a format that the model accepts.",
    text: "[Image converted from {from} to {to}.]",
    slots: { from: "The format of the image.", to: "The format that the model gets." },
  },
  {
    id: "compacted",
    group: "Compaction",
    condition: "In the chat after compaction, in place of the older messages.",
    text: "The conversation history before this point was compacted into the following summary:\n\n<summary>\n{summary}\n</summary>",
    slots: { summary: "The summary that the model wrote." },
  },
];

/** Returns the parts of a text between its slots and its line breaks, which stay as written. */
export function fixedPartsOf(text: string): string[] {
  return text
    .split(/\{\w+\}|\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Returns each text that Pi can send as the Session place shows it, marked when it is in the last
 * request of the open chat.
 */
export function summarizePiTexts(lastRequest: unknown): PiTextSummary[] {
  const sent = stringsOf(lastRequest).join("\n");
  return piTexts.map((text) => ({
    id: text.id,
    group: text.group,
    condition: text.condition,
    text: text.text,
    slots: Object.entries(text.slots).map(([name, meaning]) => ({ name, meaning })),
    isInLastRequest: patternOf(text.text).test(sent),
    ...capabilityOf(text.id),
  }));
}

function capabilityOf(id: string): Pick<PiTextSummary, "control" | "source" | "limitation"> {
  const control =
    id === "promptUpdated" || id === "promptRemoved"
      ? "promptUpdates"
      : ["toolsUpdated", "stillUnavailable", "toolsRemoved"].includes(id)
        ? "toolUpdates"
        : id === "compacted"
          ? "compactionEnvelope"
          : id === "imageResized"
            ? "imageResize"
            : null;
  const source =
    id === "claudeCode" || id === "placeholderTool"
      ? "pi-ai/dist/api/anthropic-messages.js"
      : id === "emptySystemFallback"
        ? "pi-ai/dist/api/openai-codex-responses.js"
        : id === "compacted"
          ? "pi-coding-agent/dist/core/messages.js"
          : id === "imageResized" || id === "imageConverted"
            ? "pi-coding-agent/dist/utils/image-process.js"
            : "Pi agent validation or pi-ai provider message conversion";
  return {
    control,
    source,
    limitation:
      control === null
        ? "Unavailable. Pi exposes no provider-neutral independent omission control for this addition."
        : `Controlled by ${control}.`,
  };
}

/** Where a text of Pi stands in a longer text: its id, its group, and its span. */
export interface FoundPiText {
  id: string;
  group: string;
  index: number;
  length: number;
}

/** Returns each text of Pi that a longer text holds, with where it stands, in the order found. */
export function findPiTexts(text: string): FoundPiText[] {
  return piTexts
    .flatMap((piText) => {
      const found = patternOf(piText.text).exec(text);
      return found === null
        ? []
        : [{ id: piText.id, group: piText.group, index: found.index, length: found[0].length }];
    })
    .toSorted((first, second) => first.index - second.index);
}

// A text is in a request when its fixed parts are there in order, with any value in its slots. A
// value that ends its line can hold line breaks, and a value inside a line cannot, so that parts
// far apart in a request do not count as one text.
function patternOf(text: string): RegExp {
  const parts = text.split(/\{\w+\}/);
  let source = escapeForPattern(parts[0] ?? "");
  for (const part of parts.slice(1)) {
    source += part === "" || part.startsWith("\n") ? "[\\s\\S]*?" : "[^\\n]*?";
    source += escapeForPattern(part);
  }
  return new RegExp(source);
}

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
