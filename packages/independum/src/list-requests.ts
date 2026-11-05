import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { RequestChange, RequestInput, RequestSummary } from "./api-types.ts";
import { describeMessage } from "./summarize-request.ts";

/** The requests of a chat, and what changed after the last of them, before the next one. */
export interface RequestList {
  requests: RequestSummary[];
  pendingChanges: RequestChange[];
}

// A change of model or effort is no request, so it shows only beside the request after it,
// once, with the value it ended at, and only when that value differs from the one the request
// before it used. What changed after the last request waits for the next one.
/**
 * Returns each request that the model answered, from the saved entries of a chat: what came in
 * since the request before it, the settings that changed and the compactions since then, its
 * reply, its use, and whether the model now reads it only as a summary.
 */
export function listRequests(branch: SessionEntry[]): RequestList {
  const places = new Map(branch.map((entry, index) => [entry.id, index]));
  const requests: RequestSummary[] = [];
  let inputs: RequestInput[] = [];
  let compactions: RequestChange[] = [];
  let model: { provider: string; model: string } | undefined;
  let effort: string | undefined;
  let usedModel: { provider: string; model: string } | undefined;
  let usedEffort: string | undefined;
  let isSetupRecorded = false;
  let firstKept = 0;
  for (const entry of branch) {
    if (entry.type === "model_change") {
      model = { provider: entry.provider, model: entry.modelId };
    } else if (entry.type === "thinking_level_change") {
      effort = entry.thinkingLevel;
    } else if (entry.type === "compaction") {
      // Pi keeps the newest messages before a compaction as they are, from its first kept entry on,
      // and sends a summary in place of every message before that entry.
      firstKept = places.get(entry.firstKeptEntryId) ?? places.get(entry.id) ?? 0;
      compactions.push({
        kind: "compaction",
        entryId: entry.id,
        timestamp: entry.timestamp,
        tokensBefore: entry.tokensBefore,
        summarizedRequests: requests.filter((request) => isBefore(request.id, firstKept)).length,
      });
    } else if (entry.type === "custom" && entry.customType === "independum-context") {
      isSetupRecorded = true;
    } else if (entry.type === "custom_message") {
      const described = describeMessage({ role: "custom", content: entry.content });
      inputs.push({ ...described, entryId: entry.id });
    } else if (entry.type === "message" && entry.message.role === "system") {
      // Pi saves the system prompt and the tools of a request as a message of their own, so it can
      // tell the model when they change.
      isSetupRecorded = true;
    } else if (entry.type === "message" && entry.message.role === "assistant") {
      const { usage } = entry.message;
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
        changes: changesSinceLast(),
        reply: (({ label, preview }) => ({ label, preview }))(describeMessage(entry.message)),
        isSummarized: false,
      });
      inputs = [];
      compactions = [];
      usedModel = model;
      usedEffort = effort;
      isSetupRecorded = false;
    } else if (entry.type === "message") {
      inputs.push({ ...describeMessage(entry.message), entryId: entry.id });
    }
  }
  return {
    requests: requests.map((request) => ({
      ...request,
      isSummarized: isBefore(request.id, firstKept),
    })),
    pendingChanges: changesSinceLast(),
  };

  function changesSinceLast(): RequestChange[] {
    const isModelChanged =
      model !== undefined &&
      (model.provider !== usedModel?.provider || model.model !== usedModel.model);
    return [
      ...(isModelChanged && model !== undefined ? [{ kind: "model" as const, ...model }] : []),
      ...(effort !== undefined && effort !== usedEffort
        ? [{ kind: "effort" as const, effort }]
        : []),
      ...(isSetupRecorded ? [{ kind: "setup" as const }] : []),
      ...compactions,
    ];
  }

  function isBefore(id: string, place: number): boolean {
    return (places.get(id) ?? 0) < place;
  }
}
