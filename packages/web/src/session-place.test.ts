import type { ChatState } from "independum/api-types";
import { afterEach, expect, test, vi } from "vitest";
import { findElement, renderHook } from "./render-hook.ts";
import { SessionPlace } from "./session-place.tsx";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./chat-api.ts", () => ({ fetchAgent: () => new Promise(() => undefined) }));

afterEach(() => vi.unstubAllGlobals());

test("switching chats closes a session detail that holds text from the previous chat", () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  let chat = {
    id: "a",
    folder: "folder",
    model: null,
    thinking: null,
    messages: [],
    isReplying: false,
    isCompacting: false,
    compactionError: null,
    contextVersion: 0,
    backgroundCommands: [],
    reply: [],
    toolRuns: {},
    pending: { revision: 0, isPaused: false, items: [], error: null },
    leafId: null,
    whileReplying: "queue",
  } as ChatState;
  const view = renderHook(() =>
    SessionPlace({ chat, models: undefined, context: undefined, contextFailure: undefined }),
  );
  const detail = {
    key: "entry-a",
    title: "Message",
    link: { kind: "entry", id: "a" },
    text: "Text only in A",
  };
  findElement<{ onOpen: (next: typeof detail) => void }>(
    view.render(),
    (element) => element.props.onOpen !== undefined,
  ).props.onOpen(detail);
  expect(
    findElement<{ view: typeof detail }>(
      view.render(),
      (element) => element.props.view !== undefined,
    ).props.view.text,
  ).toBe("Text only in A");
  chat = { ...chat, id: "b" };
  const tree = view.render();
  expect(() => findElement(tree, (element) => element.props.view !== undefined)).toThrow(
    "The component does not contain that element.",
  );
  expect(
    findElement<{ chat: ChatState }>(tree, (element) => element.props.chat !== undefined).props.chat
      .id,
  ).toBe("b");
});
