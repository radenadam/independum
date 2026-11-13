import type { AgentSummary, ChatState } from "independum/api-types";
import { afterEach, expect, test, vi } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { changeSettings, fetchAgent } from "./chat-api.ts";
import { renderHook } from "./render-hook.ts";
import { useAgentSettings } from "./use-agent-settings.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./chat-api.ts", () => ({ changeSettings: vi.fn(), fetchAgent: vi.fn() }));

afterEach(() => vi.resetAllMocks());

test("a failed agent load in another chat cannot show an earlier settings response", async () => {
  let chat = { id: "a", isReplying: false, model: null } as ChatState;
  const agent = { systemPrompt: "Prompt of A" } as AgentSummary;
  vi.mocked(fetchAgent).mockRejectedValue(new Error("The agent could not be loaded."));
  vi.mocked(changeSettings).mockResolvedValue(agent);
  const view = renderHook(() => useAgentSettings(chat));
  view.render();
  await waitFor(() => expect(view.render().failure).toBe("The agent could not be loaded."));
  await view.render().save({ texts: {} });
  expect(view.render().agent?.systemPrompt).toBe("Prompt of A");
  chat = { ...chat, id: "b" };
  expect(view.render().agent).toBeUndefined();
  await waitFor(() => expect(view.render().failure).toBe("The agent could not be loaded."));
  expect(view.render().agent).toBeUndefined();
});
