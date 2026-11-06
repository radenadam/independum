import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import {
  type CompactionResult,
  convertToLlm,
  type ModelRuntime,
  type SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";
import type { Settings } from "./api-types.ts";
import { applyModelOverrides } from "./model-settings.ts";
import { createModelTexts, defineText, type ModelText } from "./model-texts.ts";
import { projectContextMessages } from "./project-context-messages.ts";

const summarySystem: ModelText = defineText({
  id: "compaction.system",
  group: "Compaction",
  section: "prompt",
  label: "Summary system text",
  builtIn: "Summarize the supplied conversation data for its continuation.",
  slots: {},
});
const summaryInstructions: ModelText = defineText({
  id: "compaction.instructions",
  group: "Compaction",
  section: "prompt",
  label: "Summary instructions",
  builtIn:
    "Keep the user's requests, constraints, established facts, results, and unresolved work. Use only the supplied data.",
  slots: {},
});
const imageLabel: ModelText<"index"> = defineText({
  id: "compaction.image",
  group: "Compaction",
  section: "prompt",
  label: "Before each native image",
  builtIn: "Image {index}.",
  slots: { index: { meaning: "The one-based image index in the supplied data.", example: "1" } },
});
export const compactionEnvelope: ModelText<"summary"> = defineText({
  id: "compaction.envelope",
  group: "Compaction",
  section: "prompt",
  label: "Saved summary in later requests",
  builtIn:
    "The conversation history before this point was compacted into the following summary:\n\n<summary>\n{summary}\n</summary>",
  slots: {
    summary: { meaning: "The exact saved summary.", example: "The user asks for a review." },
  },
});
export const compactionTexts: ModelText[] = [
  summarySystem,
  summaryInstructions,
  imageLabel,
  compactionEnvelope,
];

/** The exact summary input and provider payload, including an explicit reasoning omission. */
export interface SummaryRequest {
  rendererVersion: 1;
  enabledTextIds: string[];
  sourceFingerprints: string[];
  input: unknown;
  payload: unknown;
  omission: string;
  error?: string;
}

/** Replaces Pi's summarizer while retaining its boundaries, persistence, and continuation. */
export async function summarizeContext(
  event: SessionBeforeCompactEvent,
  models: ModelRuntime,
  selected: NonNullable<ReturnType<ModelRuntime["getModel"]>>,
  settings: Settings,
  capture: (request: SummaryRequest) => void,
  transformPayload?: (payload: unknown) => Promise<unknown>,
): Promise<CompactionResult> {
  const texts = createModelTexts(() => settings.texts);
  const disabled = settings.context.pi.disabled;
  const images: ImageContent[] = [];
  function dataOf(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value
        .filter(
          (entry) =>
            !(
              typeof entry === "object" &&
              entry !== null &&
              "type" in entry &&
              entry.type === "thinking"
            ),
        )
        .map(dataOf);
    }
    if (typeof value === "object" && value !== null) {
      const object = value as Record<string, unknown>;
      if (
        object.type === "image" &&
        typeof object.data === "string" &&
        typeof object.mimeType === "string"
      ) {
        images.push({ type: "image", data: object.data, mimeType: object.mimeType });
        return { type: "imageReference", index: images.length };
      }
      return Object.fromEntries(
        Object.entries(object).map(([key, entry]) => [
          key,
          entry instanceof Set ? [...entry] : dataOf(entry),
        ]),
      );
    }
    return value;
  }
  const input = dataOf({
    previousSummary: event.preparation.previousSummary ?? null,
    messages: convertToLlm(
      projectContextMessages(event.preparation.messagesToSummarize, settings.context),
    ),
    turnPrefixMessages: convertToLlm(
      projectContextMessages(event.preparation.turnPrefixMessages, settings.context),
    ),
    ...(disabled.includes("summaryFiles") ? {} : { fileOperations: event.preparation.fileOps }),
    ...(event.customInstructions === undefined ? {} : { instructions: event.customInstructions }),
  });
  const enabledTextIds = [
    !disabled.includes("summarySystem") ? summarySystem.id : "",
    !disabled.includes("summaryInstructions") ? summaryInstructions.id : "",
    images.length > 0 && !disabled.includes("summaryImageLabels") ? imageLabel.id : "",
  ].filter(Boolean);
  const content: (TextContent | ImageContent)[] = [
    {
      type: "text",
      text: [
        disabled.includes("summaryInstructions") ? "" : texts.get(summaryInstructions),
        JSON.stringify(input),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
  for (const [index, image] of images.entries()) {
    if (!disabled.includes("summaryImageLabels")) {
      content.push({ type: "text", text: texts.fill(imageLabel, { index: index + 1 }) });
    }
    content.push(image);
  }
  const request: SummaryRequest = {
    rendererVersion: 1,
    enabledTextIds,
    sourceFingerprints: [],
    input,
    payload: null,
    omission: "Provider reasoning blocks are omitted.",
  };
  try {
    const messages = [{ role: "user" as const, content, timestamp: Date.now() }];
    const route =
      models.getPhysicalModel(selected.provider, selected.id) !== undefined
        ? { model: selected }
        : await models.resolveModel(selected, messages, {
            reason: "direct",
            thinkingLevel: "off",
            signal: event.signal,
          });
    const model = applyModelOverrides(
      route.model,
      settings.modelOverrides[route.model.provider]?.[route.model.id] ?? {},
    );
    const temperature = settings.modelOverrides[model.provider]?.[model.id]?.temperature;
    const response = await models.completeSimple(
      model,
      {
        systemPrompt: disabled.includes("summarySystem") ? "" : texts.get(summarySystem),
        messages,
      },
      {
        signal: event.signal,
        maxTokens: model.maxTokens,
        ...(temperature === undefined ? {} : { temperature }),
        onPayload: async (payload) => {
          const accepted =
            transformPayload === undefined ? payload : await transformPayload(payload);
          request.payload = accepted;
          return accepted;
        },
      },
    );
    const summary = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    if (
      event.signal.aborted ||
      response.stopReason !== "stop" ||
      response.content.some((block) => block.type === "toolCall") ||
      summary.trim() === ""
    ) {
      throw new Error("Compaction requires a complete, nonempty text response without tool calls.");
    }
    capture(request);
    return {
      summary,
      firstKeptEntryId: event.preparation.firstKeptEntryId,
      tokensBefore: event.preparation.tokensBefore,
      usage: response.usage,
      details: request,
    };
  } catch (error) {
    request.error = error instanceof Error ? error.message : "Compaction failed.";
    capture(request);
    throw error;
  }
}
