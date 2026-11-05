import { afterEach, expect, test, vi } from "vitest";
import { moveCommandToBackground, stopCommand, stopReply } from "./chat-api.ts";
import { requestApi } from "./request-api.ts";

vi.mock("./request-api.ts", () => ({ requestApi: vi.fn() }));

afterEach(() => vi.resetAllMocks());

test.each([
  {
    action: "stop a command",
    run: () => stopCommand("call 1"),
    path: "/api/chat/commands/call%201/stop",
    failure: "The command could not be stopped.",
  },
  {
    action: "background a command",
    run: () => moveCommandToBackground("call 1"),
    path: "/api/chat/commands/call%201/background",
    failure: "The command could not move to the background.",
  },
  {
    action: "stop a reply",
    run: stopReply,
    path: "/api/chat/stop",
    failure: "The reply could not be stopped.",
  },
])(
  "an unsuccessful request to $action rejects and a successful one resolves",
  async ({ run, path, failure }) => {
    vi.mocked(requestApi)
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(run()).rejects.toThrow(failure);
    await expect(run()).resolves.toBeUndefined();
    expect(requestApi).toHaveBeenCalledWith(path, { method: "POST" });
  },
);
