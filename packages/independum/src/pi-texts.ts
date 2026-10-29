import type { PiTextSummary } from "./api-types.ts";

/** A text that Pi sends to the model, with when it sends it and what its slots hold. */
interface PiText {
  id: string;
  group: string;
  condition: string;
  text: string;
  slots: Record<string, string>;
}

// The texts are copies, because Pi does not export them. A test checks each one against the code
// of the installed Pi, so an update of Pi that changes one fails `pnpm check`.
const summaryFormat = `## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const updateFormat = `## Goal
[Preserve existing goals, add new ones if the task expanded]

## Constraints & Preferences
- [Preserve existing, add new ones discovered]

## Progress
### Done
- [x] [Include previously done items AND newly completed items]

### In Progress
- [ ] [Current work - update based on progress]

### Blocked
- [Current blockers - remove if resolved]

## Key Decisions
- **[Decision]**: [Brief rationale] (preserve all previous, add new)

## Next Steps
1. [Update based on current state]

## Critical Context
- [Preserve important context, add new if needed]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const toolName = "The name of the tool that the model called.";

/** Every text that Pi can send to the model while Independum runs it, in the order shown. */
export const piTexts: PiText[] = [
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
    id: "summarySystemPrompt",
    group: "Compaction",
    condition:
      "When the context of a chat nears the context window of its model, less 16,384 tokens, or overflows it. Pi asks the same model for a summary with this system prompt. That request does not show in the Context place.",
    text: "You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant, then produce a structured summary following the exact format specified.\n\nDo NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.",
    slots: {},
  },
  {
    id: "summaryRequest",
    group: "Compaction",
    condition:
      "The message of that request. The previous summary is there only when the chat was compacted before.",
    text: "<conversation>\n{conversation}\n</conversation>\n\n<previous-summary>\n{summary}\n</previous-summary>\n\n{prompt}",
    slots: {
      conversation: "The older messages, written as the next text shows.",
      summary: "The summary from the compaction before.",
      prompt: "One of the prompts below.",
    },
  },
  {
    id: "summaryConversation",
    group: "Compaction",
    condition:
      "How Pi writes the older messages for the summary. It leaves thinking out, and cuts a tool result after 2,000 characters with the last line.",
    text: "[User]: {text}\n\n[Assistant]: {text}\n\n[Assistant tool calls]: {calls}\n\n[Tool result]: {result}\n\n[... {count} more characters truncated]",
    slots: {
      text: "The text of a message.",
      calls: "Each tool call as its name and arguments.",
      result: "The text of a tool result.",
      count: "How many characters of the result are cut.",
    },
  },
  {
    id: "summaryPrompt",
    group: "Compaction",
    condition: "The prompt for the first summary of a chat.",
    text: `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.\n\nUse this EXACT format:\n\n${summaryFormat}`,
    slots: {},
  },
  {
    id: "updatePrompt",
    group: "Compaction",
    condition: "The prompt for a summary that updates the one before it.",
    text: `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.\n\nUpdate the existing structured summary with new information. RULES:\n- PRESERVE all existing information from the previous summary\n- ADD new progress, decisions, and context from the new messages\n- UPDATE the Progress section: move items from "In Progress" to "Done" when completed\n- UPDATE "Next Steps" based on what was accomplished\n- PRESERVE exact file paths, function names, and error messages\n- If something is no longer relevant, you may remove it\n\nUse this EXACT format:\n\n${updateFormat}`,
    slots: {},
  },
  {
    id: "turnPrompt",
    group: "Compaction",
    condition:
      "The prompt for a second summary when compaction falls in the middle of a reply. Pi writes it after the messages as # Conversation, then # Instructions.",
    text: "The messages above are earlier context from an ongoing conversation. Later messages are stored separately and do not need to be reconstructed.\n\nCreate a concise checkpoint of the user's request and the progress shown above. This checkpoint will be placed before the later messages so the conversation can continue with the necessary context.\n\n## Original Request\n[What did the user ask for?]\n\n## Progress So Far\n- [Key decisions and work completed in these messages]\n\n## Context Needed to Continue\n- [Information from these messages needed to understand the later work]\n\nOnly summarize information explicitly present above. Do not infer or recreate later messages.",
    slots: {},
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
 * Returns each text that Pi can send as the Agent place shows it, marked when it is in the last
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
  }));
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

function stringsOf(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.values(value).flatMap(stringsOf);
}
