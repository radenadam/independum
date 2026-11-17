import type { AgentSummary, ChatState, ProfileResource } from "independum/api-types";
import { afterEach, expect, test, vi } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { changeSettings, fetchAgent } from "./chat-api.ts";
import { fetchProfileAgent } from "./profile-api.ts";
import { renderHook } from "./render-hook.ts";
import { useAgentSettings } from "./use-agent-settings.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./chat-api.ts", () => ({
  changeSettings: vi.fn(),
  fetchAgent: vi.fn(),
  followReconnections: () => () => undefined,
}));

vi.mock("./profile-api.ts", () => ({ fetchProfileAgent: vi.fn() }));

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

test("a profile switch never shows or saves the agent of the profile before it", async () => {
  const chat = { id: "a", isReplying: false, model: null, contextVersion: 0 } as ChatState;
  const alpha = { reference: { scope: "user", id: "alpha" }, revision: "1" } as ProfileResource;
  const beta = { reference: { scope: "user", id: "beta" }, revision: "1" } as ProfileResource;
  const alphaAgent = { systemPrompt: "Prompt of Alpha" } as AgentSummary;
  const betaAgent = Promise.withResolvers<AgentSummary>();
  vi.mocked(fetchProfileAgent)
    .mockResolvedValueOnce(alphaAgent)
    .mockReturnValueOnce(betaAgent.promise);
  let profile = alpha;
  const view = renderHook(() => useAgentSettings(chat, profile));
  view.render();
  await waitFor(() => expect(view.render().agent?.systemPrompt).toBe("Prompt of Alpha"));
  profile = beta;
  expect(view.render().agent).toBeUndefined();
  vi.mocked(changeSettings).mockImplementation(async (_id, _change, configuration) => {
    if (configuration === undefined) {
      throw new Error("The profile has not loaded yet.");
    }
    return alphaAgent;
  });
  await expect(view.render().save({ texts: {} })).rejects.toThrow(
    "The profile has not loaded yet.",
  );
  expect(vi.mocked(changeSettings).mock.calls.at(-1)?.[2]).toBeUndefined();
  betaAgent.resolve({ systemPrompt: "Prompt of Beta" } as AgentSummary);
  await waitFor(() => expect(view.render().agent?.systemPrompt).toBe("Prompt of Beta"));
  view.unmount();
});
