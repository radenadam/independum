import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { RequestInput, RequestSummary } from "./api-types.ts";
import { describeMessage } from "./summarize-request.ts";

/**
 * Returns each request that the model answered, from the saved entries of a chat: what came in
 * since the request before it, the settings that changed since then, its reply, and its use. A
 * change of model or effort is no request, so it shows only beside the request after it, once, with
 * the value it ended at, and only when that value differs from the one the request before it used.
 */
export function listRequests(branch: SessionEntry[]): RequestSummary[] {
  const requests: RequestSummary[] = [];
  let inputs: RequestInput[] = [];
  let model: string | undefined;
  let effort: string | undefined;
  let usedModel: string | undefined;
  let usedEffort: string | undefined;
  let isSetupRecorded = false;
  for (const entry of branch) {
    if (entry.type === "model_change") {
      model = entry.modelId;
    } else if (entry.type === "thinking_level_change") {
      effort = entry.thinkingLevel;
    } else if (entry.type === "custom_message") {
      const described = describeMessage({ role: "custom", content: entry.content });
      inputs.push({ ...described, entryId: entry.id });
    } else if (entry.type === "message" && entry.message.role === "system") {
      // Pi saves the system prompt and the tools of a request as a message of their own, so it can
      // tell the model when they change.
      isSetupRecorded = true;
    } else if (entry.type === "message" && entry.message.role === "assistant") {
      const { usage } = entry.message;
      const changes = [
        ...(model !== undefined && model !== usedModel ? [`Model set to ${model}`] : []),
        ...(effort !== undefined && effort !== usedEffort
          ? [`Thinking effort set to ${effort}`]
          : []),
        ...(isSetupRecorded ? ["Pi recorded the system prompt and the tools"] : []),
      ];
      requests.push({
        id: entry.id,
        timestamp: entry.timestamp,
        provider: entry.message.provider,
        model: entry.message.model,
        tokens: {
          input: usage.input,
          output: usage.output,
          reasoning: usage.reasoning ?? 0,
          cacheRead: usage.cacheRead,
          cacheWrite: usage.cacheWrite,
        },
        cost: usage.cost.total,
        inputs,
        changes,
        reply: (({ label, preview }) => ({ label, preview }))(describeMessage(entry.message)),
      });
      inputs = [];
      usedModel = model;
      usedEffort = effort;
      isSetupRecorded = false;
    } else if (entry.type === "message") {
      inputs.push({ ...describeMessage(entry.message), entryId: entry.id });
    }
  }
  return requests;
}
