import type { SystemMessage } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { projectContextMessages } from "./project-context-messages.ts";
import { builtInContext } from "./read-context-settings.ts";

test("every combination of prompt and tool update controls preserves message order and current tools", () => {
  const messages: AgentSession["messages"] = [
    { role: "system", content: "First prompt.", toolsAdded: [], timestamp: 1 },
    { role: "user", content: "Question.", timestamp: 2 },
    { role: "system", content: "Changed prompt.", toolsRemoved: [{ name: "Read" }], timestamp: 3 },
    {
      role: "toolResult",
      toolCallId: "call",
      toolName: "Read",
      content: [{ type: "text", text: "Old result." }],
      isError: false,
      timestamp: 4,
    },
  ];
  for (const hasPromptUpdates of [false, true]) {
    for (const hasToolUpdates of [false, true]) {
      const settings = structuredClone(builtInContext);
      settings.pi.disabled = [
        hasPromptUpdates ? "" : "promptUpdates",
        hasToolUpdates ? "" : "toolUpdates",
      ].filter(Boolean);
      const projected = projectContextMessages(messages, settings);
      expect(projected.filter((message) => message.role !== "system")).toEqual([
        messages[1],
        messages[3],
      ]);
      const system = projected.filter(
        (message): message is SystemMessage => message.role === "system",
      );
      expect(JSON.stringify(system[0]?.content)).toContain(
        hasPromptUpdates ? "First prompt." : "Changed prompt.",
      );
      expect(system.slice(1).some((message) => message.toolsRemoved?.length)).toBe(hasToolUpdates);
      expect(system.slice(1).some((message) => message.content !== "")).toBe(hasPromptUpdates);
    }
  }
});

test("typed envelopes and user shell context are removable without matching user strings", () => {
  const settings = structuredClone(builtInContext);
  settings.pi.disabled.push("compactionEnvelope", "branchEnvelope", "userShellContext");
  const messages: AgentSession["messages"] = [
    { role: "compactionSummary", summary: "Saved summary.", tokensBefore: 100, timestamp: 1 },
    { role: "branchSummary", summary: "Branch summary.", fromId: "branch", timestamp: 2 },
    {
      role: "bashExecution",
      command: "echo hidden",
      output: "Hidden.",
      exitCode: 0,
      cancelled: false,
      truncated: false,
      timestamp: 3,
    },
    {
      role: "user",
      content:
        "The conversation history before this point was compacted into the following summary:",
      timestamp: 4,
    },
  ];
  expect(projectContextMessages(messages, settings)).toEqual([
    { role: "user", content: "Saved summary.", timestamp: 1 },
    { role: "user", content: "Branch summary.", timestamp: 2 },
    messages[3],
  ]);
});

test("disabled generated sections are removed while owned sections remain", () => {
  const message: SystemMessage = {
    role: "system",
    content: "",
    sections: {
      preamble: "Persona.",
      tools: "Tool overview.",
      rules: "Rules.",
      docs: "Documentation.",
      cwd: "Folder.",
      addendum: "Addendum.",
      "independum-base": "Owned prompt.",
    },
    timestamp: 1,
  };
  expect(projectContextMessages([message], structuredClone(builtInContext))[0]).toMatchObject({
    sections: { "independum-base": "Owned prompt." },
  });
  expect(
    Object.keys(
      (projectContextMessages([message], structuredClone(builtInContext))[0] as SystemMessage)
        .sections ?? {},
    ),
  ).toEqual(["independum-base"]);
});
