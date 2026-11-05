import {
  getCurrentSystemMessage,
  getCurrentTools,
  type SystemMessage,
} from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { ContextSettings } from "./api-types.ts";
import { piControls } from "./read-context-settings.ts";

type AgentMessage = AgentSession["messages"][number];

/** Projects typed additions while preserving conversation and tool call order. */
export function projectContextMessages(
  messages: AgentMessage[],
  settings: ContextSettings,
): AgentMessage[] {
  const disabled = settings.pi.disabled;
  const projected = messages.flatMap((message): AgentMessage[] => {
    if (message.role === "bashExecution" && disabled.includes("userShellContext")) {
      return [];
    }
    if (
      (message.role === "compactionSummary" && disabled.includes("compactionEnvelope")) ||
      (message.role === "branchSummary" && disabled.includes("branchEnvelope"))
    ) {
      return [{ role: "user", content: message.summary, timestamp: message.timestamp }];
    }
    if (message.role !== "system") {
      return [message];
    }
    const sections = Object.fromEntries(
      Object.entries(message.sections ?? {}).filter(
        ([key]) =>
          !piControls.some((control) => control.section === key && disabled.includes(control.id)),
      ),
    );
    return [{ ...message, sections }];
  });
  const hasPromptUpdates = !disabled.includes("promptUpdates");
  const hasToolUpdates = !disabled.includes("toolUpdates");
  if (hasPromptUpdates && hasToolUpdates) {
    return projected;
  }
  const current = getCurrentSystemMessage(projected);
  if (current === undefined) {
    return projected;
  }
  const initial = projected.find((message) => message.role === "system");
  if (initial?.role !== "system") {
    return projected;
  }
  const leading: SystemMessage = {
    ...initial,
    ...(!hasPromptUpdates ? { content: current.content, sections: current.sections } : {}),
    ...(!hasToolUpdates ? { toolsAdded: getCurrentTools(projected), toolsRemoved: [] } : {}),
  };
  return projected.flatMap((message): AgentMessage[] => {
    if (message === initial) {
      return [leading];
    }
    if (message.role !== "system") {
      return [message];
    }
    const remaining: SystemMessage = {
      ...message,
      ...(!hasPromptUpdates ? { content: "", sections: {} } : {}),
      ...(!hasToolUpdates ? { toolsAdded: [], toolsRemoved: [] } : {}),
    };
    const hasContent =
      typeof remaining.content === "string"
        ? remaining.content.length > 0
        : remaining.content.length > 0;
    return hasContent ||
      Object.keys(remaining.sections ?? {}).length > 0 ||
      (remaining.toolsAdded?.length ?? 0) > 0 ||
      (remaining.toolsRemoved?.length ?? 0) > 0
      ? [remaining]
      : [];
  });
}
