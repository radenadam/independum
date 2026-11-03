import type { PartLink, PartSource, RequestGroup, RequestPart } from "./api-types.ts";
import { findPiTexts } from "./pi-texts.ts";
import { stringsOf } from "./strings-of.ts";

/** The texts that Independum knows it sends, so the parts of a request can say what they are. */
export interface KnownTexts {
  systemPrompt: string;
  addedByPi: string;
  tools: { name: string; description: string }[];
  entries: { id: string; message: unknown }[];
}

/** A part of a request before it knows its group. */
type Part = Omit<RequestPart, "group">;

/** One saved message, with what tells it apart in a request: its texts and its call ids. */
interface KnownMessage {
  id: string;
  source: PartSource;
  label: string;
  texts: string[];
  ids: string[];
}

// A short text of no known part, such as the id of the model or a setting, stays in the raw request.
const shortestOther = 40;
// A key shorter than this could match by chance, such as a word that many messages hold.
const shortestKey = 8;
const longestLabel = 80;
const groups: RequestGroup[] = ["instructions", "tools", "messages"];

/**
 * Returns the parts of a request, each with who put it there and its group: the instructions, the
 * tools, or the messages. It reads the request as data, so it works for every provider: it walks the
 * keys and items of the request and matches each one against the texts and the messages it knows.
 * Inside a key, the parts keep the order Independum sent them in. Separate keys, such as a system
 * prompt beside the messages, come in the order a model reads them, because the order of keys means
 * nothing to a provider. A key that holds nothing known, such as a setting, stays in the raw request.
 */
export function summarizeRequest(request: unknown, known: KnownTexts): RequestPart[] {
  if (typeof request !== "object" || request === null) {
    return [];
  }
  const sections = sectionsOf(request, known)
    .map(groupedParts)
    .filter((section) => section.some((part) => part.source !== "other"));
  const rank = (section: RequestPart[]): number => groups.indexOf(section[0]?.group ?? "messages");
  return sections.toSorted((first, second) => rank(first) - rank(second)).flat();
}

// A tool, a message, or the system prompt says its own group. A text of Pi or an unknown text takes
// the group of the known part before it in its key, or after it, such as a text of Pi before the
// system prompt.
function groupedParts(section: Part[]): RequestPart[] {
  const own = section.map((part): RequestGroup | undefined =>
    part.link.kind === "tool"
      ? "tools"
      : part.link.kind === "entry"
        ? "messages"
        : part.link.kind === "systemPrompt" || part.link.kind === "addedByPi"
          ? "instructions"
          : undefined,
  );
  return section.map((part, index) => {
    const before = own.slice(0, index + 1).findLast((group) => group !== undefined);
    const after = own.slice(index).find((group) => group !== undefined);
    return { ...part, group: before ?? after ?? "instructions" };
  });
}

function sectionsOf(request: object, known: KnownTexts): Part[][] {
  const messages = known.entries.flatMap(messageOf);
  // Messages come in order, so each match starts from the last one, and the same text twice in a
  // chat matches each time in turn.
  let next = 0;
  return Object.entries(request).map(([section, value]) => {
    const parts: Part[] = [];
    for (const item of Array.isArray(value) ? value : [value]) {
      const text = stringsOf(item).join("\n");
      const tools = toolsIn(text, known);
      const matched = bestOf(messages.slice(next), text);
      if (tools.length > 0) {
        parts.push(...toolPartsOf(section, text, tools));
      } else if (matched.length > 0) {
        next = messages.indexOf(matched[0] as KnownMessage);
        addMessage(parts, section, matched, text);
      } else {
        parts.push(...textPartsOf(section, text, known));
      }
    }
    return parts;
  });
}

function toolsIn(text: string, known: KnownTexts): { name: string; index: number }[] {
  return known.tools
    .flatMap((tool) => {
      const index = tool.description === "" ? -1 : text.indexOf(tool.description.slice(0, 80));
      return index === -1 ? [] : [{ name: tool.name, index }];
    })
    .toSorted((first, second) => first.index - second.index);
}

// An item can hold several tools, so each tool takes the text from its description to the next one,
// and the text before the first, such as its name, goes to the first.
function toolPartsOf(
  section: string,
  text: string,
  tools: { name: string; index: number }[],
): Part[] {
  return tools.map((tool, index) => {
    const value = text.slice(index === 0 ? 0 : tool.index, tools[index + 1]?.index ?? text.length);
    return partOf(section, "independum", tool.name, { kind: "tool", name: tool.name }, value);
  });
}

// A message can span items, such as a reply and its tool calls, so an item of the same message
// joins the part before it.
function addMessage(parts: Part[], section: string, matched: KnownMessage[], text: string): void {
  const [first] = matched;
  const last = parts.at(-1);
  if (first === undefined) {
    return;
  }
  if (last?.link.kind === "entry" && last.link.id === first.id && matched.length === 1) {
    last.text = `${last.text}\n${text}`;
    last.tokens += tokensOf(text);
    return;
  }
  const label = matched.length === 1 ? first.label : `${matched.length} ${pluralOf(first.source)}`;
  parts.push(partOf(section, first.source, label, { kind: "entry", id: first.id }, text));
}

// A text that is no message can hold several known texts, such as the system prompt with what Pi
// adds after it, so it splits where each one starts, and what is left between them stays as other.
function textPartsOf(section: string, text: string, known: KnownTexts): Part[] {
  const spans: { index: number; length: number; part: Part }[] = [];
  for (const [value, source, label, link] of [
    [known.systemPrompt, "independum", "System prompt", { kind: "systemPrompt" }],
    [known.addedByPi, "pi", "Added to the system prompt", { kind: "addedByPi" }],
  ] as const) {
    const index = value === "" ? -1 : text.indexOf(value);
    if (index !== -1) {
      spans.push({
        index,
        length: value.length,
        part: partOf(section, source, label, link, value),
      });
    }
  }
  for (const found of findPiTexts(text)) {
    const isInside = spans.some(
      (span) => found.index >= span.index && found.index < span.index + span.length,
    );
    if (!isInside) {
      const value = text.slice(found.index, found.index + found.length);
      const link: PartLink = { kind: "piText", id: found.id };
      spans.push({
        index: found.index,
        length: found.length,
        part: partOf(section, "pi", firstLineOf(value), link, value),
      });
    }
  }
  const parts: Part[] = [];
  let end = 0;
  for (const span of spans.toSorted((first, second) => first.index - second.index)) {
    parts.push(...otherPartsOf(section, text.slice(end, span.index)), span.part);
    end = Math.max(end, span.index + span.length);
  }
  parts.push(...otherPartsOf(section, text.slice(end)));
  return parts;
}

function otherPartsOf(section: string, text: string): Part[] {
  const trimmed = text.trim();
  return trimmed.length < shortestOther
    ? []
    : [partOf(section, "other", `Other text in ${section}`, { kind: "other" }, trimmed)];
}

function partOf(
  section: string,
  source: PartSource,
  label: string,
  link: PartLink,
  text: string,
): Part {
  return { section, source, label, link, text, tokens: tokensOf(text) };
}

// A token is about four characters of English text, which is close enough to compare the parts.
function tokensOf(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

// The message that an item holds is the one with the most of its texts there, and a call id counts
// less than a text, because a call and its result share one. A result counts only with its call id
// there, so a short output cannot match by chance. Of messages that tie, the earliest wins, except
// results of the same reply, which can share an item.
function bestOf(messages: KnownMessage[], text: string): KnownMessage[] {
  const scores = messages.map((message) => {
    const hasId = message.ids.some((id) => text.includes(id));
    const shortest = message.source === "tool" ? 1 : shortestKey;
    const texts = message.texts.filter((key) => key.length >= shortest && text.includes(key));
    return message.source === "tool" && !hasId ? 0 : texts.length * 2 + (hasId ? 1 : 0);
  });
  const best = Math.max(0, ...scores);
  const tied = messages.filter((_, index) => best > 0 && scores[index] === best);
  return tied[0]?.source === "tool"
    ? tied.filter((message) => message.source === "tool")
    : tied.slice(0, 1);
}

function pluralOf(source: PartSource): string {
  return source === "tool" ? "tool results" : source === "you" ? "messages" : "replies";
}

// What tells a saved message apart in a request: its text, and the ids of its tool calls. Pi saves
// the call of some providers as two ids joined by a bar, which the request sends apart, so each
// half counts on its own.
function messageOf({ id, message }: { id: string; message: unknown }): KnownMessage[] {
  if (typeof message !== "object" || message === null || !("role" in message)) {
    return [];
  }
  const blocks = "content" in message ? blocksOf(message.content) : [];
  const texts = blocks.flatMap((block) => (block.type === "text" ? [block.text ?? ""] : []));
  const callIds = blocks.flatMap((block) => (block.type === "toolCall" ? [block.id ?? ""] : []));
  const resultId =
    "toolCallId" in message && typeof message.toolCallId === "string" ? message.toolCallId : "";
  const keys = {
    texts: texts.filter((key) => key.trim() !== ""),
    ids: [...callIds, resultId]
      .flatMap((each) => each.split("|"))
      .filter((each) => each.length >= shortestKey),
  };
  const firstLine = firstLineOf(texts.join("\n"));
  const calls = blocks.flatMap((block) => (block.type === "toolCall" ? [block.name ?? ""] : []));
  const toolName =
    "toolName" in message && typeof message.toolName === "string" ? message.toolName : "a tool";
  switch (message.role) {
    case "user":
      return [{ id, source: "you", label: firstLine, ...keys }];
    case "custom":
      return [{ id, source: "independum", label: firstLine, ...keys }];
    case "assistant":
      return [{ id, source: "model", label: firstLine || `Calls ${calls.join(", ")}`, ...keys }];
    case "toolResult":
      return [{ id, source: "tool", label: `Result of ${toolName}`, ...keys }];
    default:
      return [];
  }
}

function blocksOf(content: unknown): { type: string; text?: string; id?: string; name?: string }[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((block: unknown) =>
    typeof block === "object" && block !== null && "type" in block && typeof block.type === "string"
      ? [block as { type: string; text?: string; id?: string; name?: string }]
      : [],
  );
}

function firstLineOf(text: string): string {
  return (text.trim().split("\n")[0] ?? "").slice(0, longestLabel);
}
