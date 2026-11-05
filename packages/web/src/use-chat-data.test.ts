import type { ChatState } from "independum/api-types";
import { expect, test, vi } from "vitest";
import { renderHook } from "./render-hook.ts";
import { useChatData } from "./use-chat-data.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());

test("a chat change clears old data and exposes a failed load", async () => {
  let chat = { id: "a", isReplying: false, model: null } as ChatState;
  const load = vi.fn<() => Promise<string>>().mockResolvedValueOnce("Context of A");
  const view = renderHook(() => useChatData(load, chat));
  view.render();
  await vi.waitFor(() => expect(view.render().data).toBe("Context of A"));
  load.mockRejectedValueOnce(new Error("The context could not be loaded."));
  chat = { ...chat, id: "b" };
  expect(view.render().data).toBeUndefined();
  await vi.waitFor(() =>
    expect(view.render()).toEqual({ data: undefined, failure: "The context could not be loaded." }),
  );
});

test("a late result from another chat cannot replace the current data", async () => {
  const pending = Promise.withResolvers<string>();
  let chat = { id: "a", isReplying: false, model: null } as ChatState;
  const load = vi
    .fn<() => Promise<string>>()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce("Context of B");
  const view = renderHook(() => useChatData(load, chat));
  view.render();
  chat = { ...chat, id: "b" };
  view.render();
  await vi.waitFor(() => expect(view.render().data).toBe("Context of B"));
  pending.resolve("Context of A");
  await Promise.resolve();
  expect(view.render().data).toBe("Context of B");
});
