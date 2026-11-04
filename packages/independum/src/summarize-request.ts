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

/** What a part is made of: what it is, its words for its preview and size, and its exact text. */
interface PartFields {
  section: string;
  source: PartSource;
  label: string;
  link: PartLink;
  content: string;
  exact?: string;
  preview?: string;
}

/** One saved message, with what it is and what tells it apart in a request. */
interface KnownMessage {
  id: string;
  source: PartSource;
  label: string;
  preview: string;
  texts: string[];
  ids: string[];
}

// A text of no known part left between known parts, such as the line breaks that join them, shows
// only when it is this long.
const shortestOther = 40;
// A text of a message shorter than this matches only a whole text of a request, so a short word,
// such as hello, cannot match inside another text.
const shortestKey = 8;
// A preview holds the first line of its text, up to this many characters, ending on a whole word.
const longestPreview = 200;
// Pi tells the model about a change of its prompt or tools in the chat with texts of this group, such
// as the tools that an OpenAI model gets again once one of them changes.
const changeGroup = "In the chat, after a change";
const groups: RequestGroup[] = ["instructions", "tools", "messages"];

/**
 * Returns the parts of a request, each with who put it there and its group: the instructions, the
 * tools, or the messages. It reads the request as data, so it works for every provider: it walks the
 * keys and items of the request and matches each one against the texts and the messages it knows.
 * Inside a key, the parts keep the order Independum sent them in. Separate keys, such as a system
 * prompt beside the messages, come in the order a model reads them, because the order of keys means
 * nothing to a provider. A key that holds nothing known, such as a setting, stays in the raw request,
 * and an item of a key that holds known parts always shows, so nothing that was sent goes missing.
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

/**
 * Returns the parts that the next request will hold, before a chat sends one: the system prompt and
 * what Pi adds to it, the tools that are on, and the messages that Pi will send, in the order a
 * model reads them. Its sizes are estimates, because no provider has counted it yet.
 */
export function describeNextRequest(known: KnownTexts): RequestPart[] {
  const instructions: RequestPart[] = [
    {
      ...partOf({
        section: "next",
        source: "independum",
        label: "System prompt",
        link: { kind: "systemPrompt" },
        content: known.systemPrompt,
      }),
      group: "instructions",
    },
    ...(known.addedByPi === ""
      ? []
      : [
          {
            ...partOf({
              section: "next",
              source: "pi",
              label: "Added to the system prompt",
              link: { kind: "addedByPi" },
              content: known.addedByPi,
            }),
            group: "instructions" as const,
          },
        ]),
  ];
  const tools = known.tools.map(
    (tool): RequestPart => ({
      ...partOf({
        section: "next",
        source: "independum",
        label: tool.name,
        link: { kind: "tool", name: tool.name },
        content: tool.description,
      }),
      group: "tools",
    }),
  );
  const messages = known.entries.flatMap(messageOf).map(
    (message): RequestPart => ({
      ...partOf({
        section: "next",
        source: message.source,
        label: message.label,
        link: { kind: "entry", id: message.id },
        content: [...message.texts, ...message.ids].join("\n"),
        preview: message.preview,
      }),
      group: "messages",
    }),
  );
  return [...instructions, ...tools, ...messages];
}

/** Returns who wrote a saved message, what kind of message it is, and the start of its text. */
export function describeMessage(message: unknown): {
  source: PartSource;
  label: string;
  preview: string;
} {
  const [known] = messageOf({ id: "", message });
  return {
    source: known?.source ?? "other",
    label: known?.label ?? "Message",
    preview: known?.preview ?? "",
  };
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
      const strings = stringsOf(item);
      const content = strings.join("\n");
      const exact = typeof item === "string" ? item : JSON.stringify(item, null, 2);
      const tools = toolsIn(content, known);
      const matched = bestOf(messages.slice(next), content, strings);
      const update = findPiTexts(content).find((found) => found.group === changeGroup);
      if (update !== undefined && tools.length > 0) {
        parts.push(
          partOf({
            section,
            source: "pi",
            label: "Tools sent again",
            link: { kind: "piText", id: update.id },
            content,
            exact,
            preview: tools.map((tool) => tool.name).join(", "),
          }),
        );
      } else if (tools.length > 0) {
        parts.push(...toolPartsOf(section, item, content, tools));
      } else if (matched.length > 0) {
        next = messages.indexOf(matched[0] as KnownMessage);
        addMessage(parts, section, matched, content, exact);
      } else {
        parts.push(...textPartsOf(section, content, exact, known));
      }
    }
    return parts;
  });
}

function toolsIn(
  text: string,
  known: KnownTexts,
): { name: string; description: string; index: number }[] {
  return known.tools
    .flatMap((tool) => {
      const index = tool.description === "" ? -1 : text.indexOf(tool.description.slice(0, 80));
      return index === -1 ? [] : [{ ...tool, index }];
    })
    .toSorted((first, second) => first.index - second.index);
}

// An item can hold several tools, so each tool takes the text from its description to the next one
// for its size, and shows the smallest part of the item that holds its description, as it was sent.
function toolPartsOf(
  section: string,
  item: unknown,
  content: string,
  tools: { name: string; description: string; index: number }[],
): Part[] {
  return tools.map((tool, index) => {
    const start = index === 0 ? 0 : tool.index;
    return partOf({
      section,
      source: "independum",
      label: tool.name,
      link: { kind: "tool", name: tool.name },
      content: content.slice(start, tools[index + 1]?.index ?? content.length),
      exact: JSON.stringify(holderOf(item, tool.description.slice(0, 80)) ?? item, null, 2),
      preview: firstLineOf(tool.description),
    });
  });
}

// The smallest object or item inside a value whose strings hold a text, such as one tool of a list.
function holderOf(value: unknown, text: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  for (const child of Object.values(value)) {
    const inner = holderOf(child, text);
    if (inner !== undefined) {
      return inner;
    }
  }
  return stringsOf(value).some((each) => each.includes(text)) ? value : undefined;
}

// A message can span items, such as a reply and its tool calls, so an item of the same message
// joins the part before it.
function addMessage(
  parts: Part[],
  section: string,
  matched: KnownMessage[],
  content: string,
  exact: string,
): void {
  const [first] = matched;
  const last = parts.at(-1);
  if (first === undefined) {
    return;
  }
  if (last?.link.kind === "entry" && last.link.id === first.id && matched.length === 1) {
    last.text = `${last.text}\n${exact}`;
    last.tokens += tokensOf(content);
    return;
  }
  parts.push(
    partOf({
      section,
      source: first.source,
      label: matched.length === 1 ? first.label : `${matched.length} tool results`,
      link: { kind: "entry", id: first.id },
      content,
      exact,
      preview: matched.length === 1 ? first.preview : matched.map((each) => each.label).join(", "),
    }),
  );
}

// A text that is no message can hold several known texts, such as the system prompt with what Pi
// adds after it, so it splits where each one starts. A whole item that holds none of them shows as
// other text.
function textPartsOf(section: string, content: string, exact: string, known: KnownTexts): Part[] {
  const spans: { index: number; length: number; part: Part }[] = [];
  for (const [value, source, label, link] of [
    [known.systemPrompt, "independum", "System prompt", { kind: "systemPrompt" }],
    [known.addedByPi, "pi", "Added to the system prompt", { kind: "addedByPi" }],
  ] as const) {
    const index = value === "" ? -1 : content.indexOf(value);
    if (index !== -1) {
      spans.push({
        index,
        length: value.length,
        part: partOf({ section, source, label, link, content: value }),
      });
    }
  }
  for (const found of findPiTexts(content)) {
    const isInside = spans.some(
      (span) => found.index >= span.index && found.index < span.index + span.length,
    );
    if (!isInside) {
      const value = content.slice(found.index, found.index + found.length);
      spans.push({
        index: found.index,
        length: found.length,
        part: partOf({
          section,
          source: "pi",
          label: "Text of Pi",
          link: { kind: "piText", id: found.id },
          content: value,
        }),
      });
    }
  }
  if (spans.length === 0) {
    return content.trim() === "" ? [] : [otherOf(section, content.trim(), exact)];
  }
  const parts: Part[] = [];
  let end = 0;
  for (const span of spans.toSorted((first, second) => first.index - second.index)) {
    parts.push(...leftOverOf(section, content.slice(end, span.index)), span.part);
    end = Math.max(end, span.index + span.length);
  }
  parts.push(...leftOverOf(section, content.slice(end)));
  return parts;
}

function leftOverOf(section: string, text: string): Part[] {
  const trimmed = text.trim();
  return trimmed.length < shortestOther ? [] : [otherOf(section, trimmed, trimmed)];
}

function otherOf(section: string, content: string, exact: string): Part {
  return partOf({
    section,
    source: "other",
    label: "Other text",
    link: { kind: "other" },
    content,
    exact,
  });
}

function partOf({ section, source, label, link, content, exact, preview }: PartFields): Part {
  return {
    section,
    source,
    label,
    link,
    preview: preview ?? firstLineOf(content),
    text: exact ?? content,
    tokens: tokensOf(content),
  };
}

// A token is about four characters of English text, which is close enough to compare the parts.
function tokensOf(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

// The message that an item holds is the one with the most of its texts there, and a call id counts
// less than a text, because a call and its result share one. A result counts only with its call id
// there, so a short output cannot match by chance, and a short text of any other message matches
// only a whole text of the item. Of messages that tie, the earliest wins, except results of the same
// reply, which can share an item.
function bestOf(messages: KnownMessage[], content: string, strings: string[]): KnownMessage[] {
  const scores = messages.map((message) => {
    const hasId = message.ids.some((id) => content.includes(id));
    const isTool = message.source === "tool";
    const texts = message.texts.filter((key) =>
      isTool || key.length >= shortestKey ? content.includes(key) : strings.includes(key),
    );
    return isTool && !hasId ? 0 : texts.length * 2 + (hasId ? 1 : 0);
  });
  const best = Math.max(0, ...scores);
  const tied = messages.filter((_, index) => best > 0 && scores[index] === best);
  return tied[0]?.source === "tool"
    ? tied.filter((message) => message.source === "tool")
    : tied.slice(0, 1);
}

// What a saved message is, and what tells it apart in a request: its text, and the ids of its tool
// calls. Pi saves the call of some providers as two ids joined by a bar, which the request sends
// apart, so each half counts on its own.
function messageOf({ id, message }: { id: string; message: unknown }): KnownMessage[] {
  if (typeof message !== "object" || message === null || !("role" in message)) {
    return [];
  }
  const blocks = "content" in message ? blocksOf(message.content) : [];
  const texts = blocks.flatMap((block) => (block.type === "text" ? [block.text ?? ""] : []));
  const calls = blocks.filter((block) => block.type === "toolCall");
  const resultId =
    "toolCallId" in message && typeof message.toolCallId === "string" ? message.toolCallId : "";
  const keys = {
    texts: texts.filter((key) => key.trim() !== ""),
    ids: [...calls.map((call) => call.id ?? ""), resultId]
      .flatMap((each) => each.split("|"))
      .filter((each) => each.length >= shortestKey),
  };
  const preview = firstLineOf(texts.join("\n"));
  const callNames = calls.map((call) => call.name ?? "").join(", ");
  const toolName =
    "toolName" in message && typeof message.toolName === "string" ? message.toolName : "a tool";
  switch (message.role) {
    case "user":
      return [{ id, source: "you", label: "Message", preview, ...keys }];
    case "custom":
      return [{ id, source: "independum", label: "Note", preview, ...keys }];
    case "assistant":
      return [
        texts.join("").trim() === ""
          ? {
              id,
              source: "model",
              label: `Calls ${callNames}`,
              preview: firstLineOf(calls.flatMap((call) => stringsOf(call.arguments)).join(" ")),
              ...keys,
            }
          : { id, source: "model", label: "Reply", preview, ...keys },
      ];
    case "toolResult":
      return [{ id, source: "tool", label: `Result of ${toolName}`, preview, ...keys }];
    default:
      return [];
  }
}

function blocksOf(
  content: unknown,
): { type: string; text?: string; id?: string; name?: string; arguments?: unknown }[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((block: unknown) =>
    typeof block === "object" && block !== null && "type" in block && typeof block.type === "string"
      ? [block as { type: string; text?: string; id?: string; name?: string; arguments?: unknown }]
      : [],
  );
}

function firstLineOf(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  if (line.length <= longestPreview) {
    return line;
  }
  const cut = line.slice(0, longestPreview);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 1));
}
