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
    `instructions pi ${piText.split("\n")[0]}`,
    "instructions independum System prompt",
    "instructions pi Added to the system prompt",
    "tools independum Read",
    "messages you Read the notes file for me, please.",
    "messages model Reading the notes file now.",
    "messages tool Result of Read",
    "messages independum Background command 1 ended with exit code 0.",
  ]);
});

test("a reply split into items, such as its text and its tool calls, reads as one part", () => {
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
    "messages you Read the notes file for me, please.",
    "messages model Reading the notes file now.",
    "messages tool Result of Read",
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
    "messages you Read the notes file for me, please.",
    "messages model Calls Read",
    "messages tool Result of Read",
  ]);
});
// biome-ignore-end lint/style/useNamingConvention: Providers name the keys of a request in snake case.

test("a text that no part knows shows as other beside known parts, and a setting stays out", () => {
  const other = "A text that the provider added, which Independum does not know about at all.";
  const request = { model: "a-model", preamble: other, instructions: `${prompt}\n\n${other}` };
  expect(partsOf(request)).toEqual([
    "instructions independum System prompt",
    "instructions other Other text in instructions",
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
    "messages you Read the notes file for me, please.",
    "messages model Reading the notes file now.",
    "messages tool Result of Read",
    "messages independum Background command 1 ended with exit code 0.",
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
    "messages you Read the notes file for me, please.",
    "messages pi Tools sent again: Read",
  ]);
});
