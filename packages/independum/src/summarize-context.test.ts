import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import type { ModelRuntime, SessionBeforeCompactEvent } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { builtInSettings } from "./read-settings-change.ts";
import { type SummaryRequest, summarizeContext } from "./summarize-context.ts";

function summaryModel(): NonNullable<ReturnType<ModelRuntime["getModel"]>> {
  const model = fauxProvider({ models: [{ id: "summary" }] }).models[0];
  if (model === undefined) {
    throw new Error("The test model is missing.");
  }
  return model;
}

function preparation(): SessionBeforeCompactEvent {
  return {
    type: "session_before_compact",
    reason: "manual",
    willRetry: false,
    signal: new AbortController().signal,
    branchEntries: [],
    preparation: {
      firstKeptEntryId: "kept",
      messagesToSummarize: [{ role: "user", content: "Earlier question.", timestamp: 1 }],
      turnPrefixMessages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Split prefix." },
            { type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
          ],
          timestamp: 2,
        },
      ],
      previousSummary: "Previous summary.",
      isSplitTurn: true,
      tokensBefore: 100,
      fileOps: {
        read: new Set(["read.txt"]),
        written: new Set(["written.txt"]),
        edited: new Set(),
      },
      settings: { enabled: true, reserveTokens: 0, keepRecentTokens: 0 },
    },
  };
}

test("one replacement summary request includes both prepared arrays prior summary and native images", async () => {
  const model = summaryModel();
  const complete = vi.fn(async (_model, input, options) => {
    options.onPayload({ request: input });
    return fauxAssistantMessage("Complete summary.");
  });
  const models = {
    getPhysicalModel: () => model,
    completeSimple: complete,
  } as unknown as ModelRuntime;
  const captured: SummaryRequest[] = [];
  const result = await summarizeContext(
    preparation(),
    models,
    model,
    structuredClone(builtInSettings),
    (request) => captured.push(request),
  );
  expect(complete).toHaveBeenCalledOnce();
  expect(result).toMatchObject({
    summary: "Complete summary.",
    firstKeptEntryId: "kept",
    tokensBefore: 100,
  });
  expect(JSON.stringify(captured[0]?.input)).toContain("Earlier question.");
  expect(JSON.stringify(captured[0]?.input)).toContain("Split prefix.");
  expect(JSON.stringify(captured[0]?.input)).toContain("Previous summary.");
  expect(JSON.stringify(captured[0]?.input)).toContain('"type":"imageReference","index":1');
  expect(JSON.stringify(captured[0]?.payload)).toContain("aW1hZ2U=");
  expect(JSON.stringify(captured[0]?.input)).not.toContain("aW1hZ2U=");
});

test("summary switches omit owned texts and file data without a replacement prompt", async () => {
  const model = summaryModel();
  const complete = vi.fn(async () => fauxAssistantMessage("Summary."));
  const models = {
    getPhysicalModel: () => model,
    completeSimple: complete,
  } as unknown as ModelRuntime;
  const settings = structuredClone(builtInSettings);
  settings.context.pi.disabled.push(
    "summarySystem",
    "summaryInstructions",
    "summaryFiles",
    "summaryImageLabels",
  );
  const captures: SummaryRequest[] = [];
  await summarizeContext(preparation(), models, model, settings, (request) =>
    captures.push(request),
  );
  expect(captures[0]?.enabledTextIds).toEqual([]);
  expect(JSON.stringify(captures[0]?.input)).not.toContain("fileOperations");
  expect(complete.mock.calls[0]).toEqual([
    expect.anything(),
    expect.objectContaining({ systemPrompt: "" }),
    expect.anything(),
  ]);
});

test("failed partial empty tool and aborted summaries never return a checkpoint", async () => {
  const model = summaryModel();
  for (const response of [
    fauxAssistantMessage("Partial", { stopReason: "length" }),
    fauxAssistantMessage("Failure", { stopReason: "error" }),
    fauxAssistantMessage("Stopped", { stopReason: "aborted" }),
    fauxAssistantMessage("  "),
    fauxAssistantMessage([fauxToolCall("Read", { path: "file" })], { stopReason: "toolUse" }),
  ]) {
    const models = {
      getPhysicalModel: () => model,
      completeSimple: async () => response,
    } as unknown as ModelRuntime;
    const captures: SummaryRequest[] = [];
    await expect(
      summarizeContext(preparation(), models, model, structuredClone(builtInSettings), (request) =>
        captures.push(request),
      ),
    ).rejects.toThrow("complete, nonempty");
    expect(captures[0]?.error).toContain("complete, nonempty");
  }
});
