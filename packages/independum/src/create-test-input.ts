import { randomUUID } from "node:crypto";
import type { PendingInput } from "./api-types.ts";

/** Returns a waiting message with a stand-in model, as a test submits it. */
export function createTestInput(
  text = "A prompt",
): Omit<PendingInput, "sequence" | "createdAt" | "state" | "reason"> {
  return {
    id: randomUUID(),
    text,
    delivery: "queue",
    model: { providerId: "faux", modelId: "first", thinkingLevel: "off" },
    hasBrowserApprovals: false,
    command: null,
  };
}
