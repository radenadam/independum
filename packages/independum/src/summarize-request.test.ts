import { expect, test } from "vitest";
import { piTexts } from "./pi-texts.ts";
import { describeNextRequest, type KnownTexts, summarizeRequest } from "./summarize-request.ts";

const prompt = "You are the agent in Independum, and you work in the project folder below.";
const added = "<cwd>\nC:/work/project\n</cwd>";
const readDescription = "Reads a file and returns its lines, each after its number and a tab.";
const piText = piTexts.find((text) => !text.text.includes("{"))?.text ?? "";
const known: KnownTexts = {
  systemPrompt: prompt,
  addedByPi: added,
  tools: [{ name: "Read", description: readDescription }],
  entries: [
    { id: "e1", message: { role: "user", content: "Read the notes file for me, please." } },
    {
      id: "e2",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Reading the notes file now." },
          { type: "toolCall", id: "call_0001abcd", name: "Read", arguments: { path: "notes.md" } },
        ],
      },
    },
    {
      id: "e3",
      message: {
        role: "toolResult",
        toolCallId: "call_0001abcd",
        toolName: "Read",
        content: [{ type: "text", text: "1\tThe notes." }],
      },
    },
    {
      id: "e4",
      message: { role: "custom", content: "Background command 1 ended with exit code 0." },
    },
  ],
};

const writtenAt = "Written at 2026-11-05 21:14 +07:00\n\n";
const withFacts: KnownTexts = {
  ...known,
  addedFacts: [
    {
      id: "facts.harness",
      label: "Harness",
      text: "Harness: Independum 0.0.0.",
      group: "instructions",
    },
    {
      id: "facts.messageTime",
      label: "Message time",
      text: writtenAt,
      group: "messages",
      entryId: "e1",
    },
    {
      id: "facts.messageTime",
      label: "Message time",
      text: writtenAt,
      group: "messages",
      entryId: "e3",
    },
  ],
};

test("added facts keep their place in the system prompt and before messages and results", () => {
  const parts = summarizeRequest(
    {
      instructions: `${prompt}\n\nHarness: Independum 0.0.0.`,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: writtenAt },
            { type: "text", text: "Read the notes file for me, please." },
          ],
        },
        { role: "tool", toolCallId: "call_0001abcd", content: `${writtenAt}1\tThe notes.` },
      ],
    },
    withFacts,
  );
  expect(parts.map((part) => `${part.group} ${part.label}`)).toEqual([
    "instructions System prompt",
    "instructions Harness",
    "messages Message time",
    "messages You wrote",
    "messages Message time",
    "messages Read returned",
  ]);
  expect(parts[2]?.link).toEqual({ kind: "addedFact", id: "facts.messageTime", entryId: "e1" });
  expect(parts[4]?.link).toEqual({ kind: "addedFact", id: "facts.messageTime", entryId: "e3" });
  expect(parts.filter((part) => part.link.kind === "addedFact").map((part) => part.text)).toEqual([
    "Harness: Independum 0.0.0.",
    writtenAt,
    writtenAt,
  ]);
});

test("the next request shows only the added facts it will send beside their messages", () => {
  const parts = describeNextRequest(withFacts);
  expect(parts.filter((part) => part.link.kind === "addedFact").map((part) => part.group)).toEqual([
    "instructions",
    "messages",
    "messages",
  ]);
  expect(
    describeNextRequest({ ...withFacts, addedFacts: [] }).some(
      (part) => part.link.kind === "addedFact",
    ),
  ).toBe(false);
});

test("tool results in one provider message each keep their time even in the same minute", () => {
  const entries = [
    {
      id: "first-result",
      message: {
        role: "toolResult",
        toolName: "Read",
        toolCallId: "call_first_result",
        content: [{ type: "text", text: "First output." }],
      },
    },
    {
      id: "second-result",
      message: {
        role: "toolResult",
        toolName: "Read",
        toolCallId: "call_second_result",
        content: [{ type: "text", text: "Second output." }],
      },
    },
  ];
  const facts: KnownTexts = {
    ...known,
    entries,
    addedFacts: entries.map((entry) => ({
      id: "facts.messageTime",
      label: "Message time",
      text: writtenAt,
      group: "messages",
      entryId: entry.id,
    })),
  };
  const parts = summarizeRequest(
    {
      messages: [
        {
          role: "user",
          content: entries.map((entry, index) => ({
            type: "tool_result",
            toolCallId: entry.message.toolCallId,
            content: `${writtenAt}${index === 0 ? "First" : "Second"} output.`,
          })),
        },
      ],
    },
    facts,
  );
  expect(parts.map((part) => part.link.kind)).toEqual(["addedFact", "entry", "addedFact", "entry"]);
  expect(parts.filter((part) => part.link.kind === "addedFact").map((part) => part.link)).toEqual(
    entries.map((entry) => ({ kind: "addedFact", id: "facts.messageTime", entryId: entry.id })),
  );
});

function partsOf(request: unknown): string[] {
  return summarizeRequest(request, known).map(
    (part) => `${part.group} ${part.source} ${part.label}`,
  );
}

// biome-ignore-start lint/style/useNamingConvention: Providers name the keys of a request in snake case.
test("a request reads as its instructions, tools, and messages, each in the order it was sent", () => {
  const request = {
    model: "a-model",
    messages: [
      { role: "user", content: "Read the notes file for me, please." },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Reading the notes file now." },
          { type: "tool_use", id: "call_0001abcd", name: "Read", input: { path: "notes.md" } },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "call_0001abcd", content: "1\tThe notes." }],
      },
      { role: "user", content: "Background command 1 ended with exit code 0." },
    ],
    betas: ["a-setting-of-the-provider-that-is-long-enough-to-count"],
    system: [
      { type: "text", text: piText },
      { type: "text", text: `${prompt}\n\n${added}` },
    ],
    tools: [{ name: "Read", description: readDescription, input_schema: { type: "object" } }],
  };
  expect(partsOf(request)).toEqual([
    "instructions pi Added by Pi",
    "instructions independum System prompt",
    "instructions pi Added to the system prompt",
    "tools independum Read",
    "messages you You wrote",
    "messages model Model replied",
    "messages model Model called Read",
    "messages tool Read returned",
    "messages independum Independum noted",
  ]);
});

test("a reply sent as its text and its tool calls apart reads as a reply and its calls", () => {
  const request = {
    instructions: `${prompt}\n${added}`,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "Read the notes file for me, please." }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Reading the notes file now." }],
      },
      {
        type: "function_call",
        call_id: "call_0001abcd",
        name: "Read",
        arguments: '{"path":"notes.md"}',
      },
      { type: "function_call_output", call_id: "call_0001abcd", output: "1\tThe notes." },
    ],
    tools: [{ type: "function", name: "Read", description: readDescription, parameters: {} }],
  };
  expect(partsOf(request)).toEqual([
    "instructions independum System prompt",
    "instructions pi Added to the system prompt",
    "tools independum Read",
    "messages you You wrote",
    "messages model Model replied",
    "messages model Model called Read",
    "messages tool Read returned",
  ]);
});
test("a request that holds everything in one list keeps its order, with a part for each tool", () => {
  const joined: KnownTexts = {
    ...known,
    tools: [
      ...known.tools,
      { name: "Write", description: "Writes a file with the given content." },
    ],
    entries: [
      known.entries[0] as KnownTexts["entries"][number],
      {
        id: "e2",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", id: "call_0002abcd|fc_0002abcd", name: "Read" }],
        },
      },
      {
        id: "e3",
        message: {
          role: "toolResult",
          toolCallId: "call_0002abcd|fc_0002abcd",
          toolName: "Read",
          content: [{ type: "text", text: "1\tThe notes." }],
        },
      },
    ],
  };
  const request = {
    input: [
      {
        type: "additional_tools",
        tools: [
          { name: "Read", description: readDescription },
          { name: "Write", description: "Writes a file with the given content." },
        ],
      },
      { role: "developer", content: `${prompt}\n\n${added}` },
      {
        role: "user",
        content: [{ type: "input_text", text: "Read the notes file for me, please." }],
      },
      { type: "function_call", id: "fc_0002abcd", call_id: "call_0002abcd", name: "Read" },
      { type: "function_call_output", call_id: "call_0002abcd", output: "1\tThe notes." },
    ],
  };
  expect(
    summarizeRequest(request, joined).map((part) => `${part.group} ${part.source} ${part.label}`),
  ).toEqual([
    "tools independum Read",
    "tools independum Write",
    "instructions independum System prompt",
    "instructions pi Added to the system prompt",
    "messages you You wrote",
    "messages model Model called Read",
    "messages tool Read returned",
  ]);
});
// biome-ignore-end lint/style/useNamingConvention: Providers name the keys of a request in snake case.

test("a text that no part knows shows as other beside known parts, and a setting stays out", () => {
  const other = "A text that the provider added, which Independum does not know about at all.";
  const request = { model: "a-model", preamble: other, instructions: `${prompt}\n\n${other}` };
  expect(partsOf(request)).toEqual([
    "instructions independum System prompt",
    "instructions other Other text",
  ]);
});

test("each part estimates its tokens from its length", () => {
  const [part] = summarizeRequest({ instructions: prompt }, known);
  expect(part?.tokens).toBe(Math.round(prompt.length / 4));
});

test("the next request, before a chat sends one, holds the prompt, the tools, and the messages", () => {
  const parts = describeNextRequest(known).map(
    (part) => `${part.group} ${part.source} ${part.label}`,
  );
  expect(parts).toEqual([
    "instructions independum System prompt",
    "instructions pi Added to the system prompt",
    "tools independum Read",
    "messages you You wrote",
    "messages model Model replied",
    "messages tool Read returned",
    "messages independum Independum noted",
  ]);
});

test("a tools update of Pi among the messages reads as one part of Pi, not as tools", () => {
  const update = piTexts.find((text) => text.id === "toolsUpdated")?.text ?? "";
  const request = {
    input: [
      { role: "developer", content: prompt },
      {
        role: "user",
        content: [{ type: "input_text", text: "Read the notes file for me, please." }],
      },
      {
        type: "message",
        role: "developer",
        content: update,
        tools: [{ name: "Read", description: readDescription }],
      },
    ],
  };
  expect(partsOf(request)).toEqual([
    "instructions independum System prompt",
    "messages you You wrote",
    "messages pi Pi sent the tools again",
  ]);
});

test("a short message matches, shows as it was sent, and nothing sent goes missing", () => {
  const short: KnownTexts = {
    ...known,
    entries: [{ id: "e1", message: { role: "user", content: "hello" } }],
  };
  const sent = { role: "user", content: [{ type: "input_text", text: "hello" }] };
  const unknown = { role: "system", content: [], note: "a remark" };
  const parts = summarizeRequest({ instructions: prompt, input: [sent, unknown] }, short);
  expect(parts.map((part) => `${part.group} ${part.source} ${part.label} ${part.preview}`)).toEqual(
    [
      `instructions independum System prompt ${prompt}`,
      "messages you You wrote hello",
      "messages other Other text system",
    ],
  );
  expect(parts[1]?.text).toBe(JSON.stringify(sent, null, 2));
});

test("a thinking level among the messages reads as the effort that Pi sends, but a setting stays out", () => {
  const effort = { role: "system", content: [], settings: { effort: "xhigh" } };
  const setting = { effort: "medium", summary: "auto" };
  expect(partsOf({ instructions: prompt, reasoning: setting, messages: [effort] })).toEqual([
    "instructions independum System prompt",
    "instructions pi Thinking effort",
  ]);
});

test("the next request after a compaction holds the summary of pi in place of the older messages", () => {
  const parts = describeNextRequest({
    ...known,
    entries: [
      {
        id: "context-0",
        message: { role: "compactionSummary", summary: "We read the notes.", tokensBefore: 900 },
      },
    ],
  }).filter((part) => part.group === "messages");
  expect(parts).toMatchObject([
    { source: "pi", label: "Added by Pi", link: { kind: "piText", id: "compacted" } },
  ]);
  expect(parts[0]?.text).toContain("We read the notes.");
});
