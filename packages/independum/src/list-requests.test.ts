import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { listRequests } from "./list-requests.ts";

const usage = {
  input: 10,
  output: 5,
  reasoning: 2,
  cacheRead: 100,
  cacheWrite: 0,
  totalTokens: 115,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.001 },
};

function entry(id: string, fields: object): SessionEntry {
  return {
    id,
    parentId: null,
    timestamp: `2026-11-04T10:00:0${id}.000Z`,
    ...fields,
  } as SessionEntry;
}

function reply(id: string, content: object[]): SessionEntry {
  const message = { role: "assistant", content, provider: "openai", model: "gpt-6-luna", usage };
  return entry(id, { type: "message", message });
}

test("each reply is one request, with what came in before it and the settings changed before it", () => {
  const branch = [
    entry("1", { type: "model_change", provider: "openai", modelId: "gpt-6-luna" }),
    entry("2", { type: "thinking_level_change", thinkingLevel: "high" }),
    entry("3", { type: "message", message: { role: "user", content: "Read the notes, please." } }),
    reply("4", [{ type: "toolCall", id: "call_0002efgh", name: "Read", arguments: {} }]),
    entry("5", {
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "call_0002efgh",
        toolName: "Read",
        content: [{ type: "text", text: "1\tThe notes." }],
      },
    }),
    entry("6", { type: "custom_message", customType: "note", content: "Command 1 ended." }),
    reply("7", [{ type: "text", text: "The notes say hello." }]),
  ];
  expect(listRequests(branch).requests).toMatchObject([
    {
      id: "4",
      model: "gpt-6-luna",
      changes: [
        { kind: "model", provider: "openai", model: "gpt-6-luna" },
        { kind: "effort", effort: "high" },
      ],
      inputs: [
        { source: "you", label: "You wrote", preview: "Read the notes, please.", entryId: "3" },
      ],
      reply: { label: "Model called Read" },
      tokens: { input: 10, output: 5, reasoning: 2, cacheRead: 100, cacheWrite: 0 },
      cost: 0.001,
    },
    {
      id: "7",
      changes: [],
      inputs: [
        { source: "tool", label: "Read returned", entryId: "5" },
        {
          source: "independum",
          label: "Independum noted",
          preview: "Command 1 ended.",
          entryId: "6",
        },
      ],
      reply: { label: "Model replied", preview: "The notes say hello." },
    },
  ]);
});

test("a change of model or effort with no reply after it lists no request", () => {
  const branch = [entry("1", { type: "thinking_level_change", thinkingLevel: "low" })];
  expect(listRequests(branch).requests).toEqual([]);
});

test("settings changed back and forth before a request count once, at their last value", () => {
  const branch = [
    entry("1", { type: "model_change", provider: "anthropic", modelId: "claude-haiku-5-5" }),
    entry("2", { type: "thinking_level_change", thinkingLevel: "medium" }),
    entry("3", { type: "message", message: { role: "system", content: "", sections: {} } }),
    entry("4", { type: "model_change", provider: "anthropic", modelId: "claude-haiku-5-5" }),
    entry("5", { type: "thinking_level_change", thinkingLevel: "low" }),
    reply("6", [{ type: "text", text: "Hello there, friend." }]),
    entry("7", { type: "thinking_level_change", thinkingLevel: "low" }),
    reply("8", [{ type: "text", text: "Hello once more." }]),
  ];
  expect(listRequests(branch).requests.map((request) => request.changes)).toEqual([
    [
      { kind: "model", provider: "anthropic", model: "claude-haiku-5-5" },
      { kind: "effort", effort: "low" },
      { kind: "setup" },
    ],
    [],
  ]);
});

test("a compaction shows before the request after it, and marks the requests it summarized", () => {
  const branch = [
    entry("1", { type: "message", message: { role: "user", content: "First." } }),
    reply("2", [{ type: "text", text: "One." }]),
    entry("3", { type: "message", message: { role: "user", content: "Second." } }),
    reply("4", [{ type: "text", text: "Two." }]),
    entry("5", {
      type: "compaction",
      summary: "Talked twice.",
      firstKeptEntryId: "3",
      tokensBefore: 900,
    }),
    entry("6", { type: "message", message: { role: "user", content: "Third." } }),
    reply("7", [{ type: "text", text: "Three." }]),
  ];
  const { requests } = listRequests(branch);
  expect(requests.map((request) => request.isSummarized)).toEqual([true, false, false]);
  expect(requests[2]?.changes).toEqual([
    {
      kind: "compaction",
      entryId: "5",
      timestamp: "2026-11-04T10:00:05.000Z",
      tokensBefore: 900,
      summarizedRequests: 1,
    },
  ]);
});

test("what changed after the last request waits for the next one", () => {
  const branch = [
    entry("1", { type: "message", message: { role: "user", content: "First." } }),
    reply("2", [{ type: "text", text: "One." }]),
    entry("3", { type: "thinking_level_change", thinkingLevel: "high" }),
    entry("4", {
      type: "compaction",
      summary: "Talked once.",
      firstKeptEntryId: "3",
      tokensBefore: 500,
    }),
  ];
  expect(listRequests(branch).pendingChanges).toEqual([
    { kind: "effort", effort: "high" },
    {
      kind: "compaction",
      entryId: "4",
      timestamp: "2026-11-04T10:00:04.000Z",
      tokensBefore: 500,
      summarizedRequests: 1,
    },
  ]);
});
