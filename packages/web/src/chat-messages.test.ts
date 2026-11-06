import type { ChatMessage, ChatState } from "independum/api-types";
import type { ReactElement, RefObject } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { ChatMessages } from "./chat-messages.tsx";
import { findElement, renderHook } from "./render-hook.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());

afterEach(() => vi.unstubAllGlobals());

const branchProperties = {
  chat: { branchSelectionId: null } as ChatState,
  models: undefined,
  onEdit: vi.fn(),
  onOpenModels: vi.fn(),
  onManageLogins: vi.fn(),
};

test("messages with the same timestamp keep distinct keys", () => {
  const messages: ChatMessage[] = ["user", "user", "note", "note"].map((role) => ({
    role: role as ChatMessage["role"],
    parts: [{ type: "text", text: "A message" }],
    timestamp: 123,
    durationMs: null,
    error: null,
    commandEnd: null,
  }));
  const view = renderHook(() =>
    ChatMessages({
      ...branchProperties,
      chatId: "chat",
      messages,
      reply: [],
      tools: { runs: {}, ends: {}, shown: undefined, onMove: vi.fn(), onStop: vi.fn() },
      isReplying: false,
    }),
  );
  const list = findElement<{ children: ReactElement[] }>(
    view.render(),
    (element) => element.type === "ol",
  );
  const keys = list.props.children.map((child) => child.key);
  expect(new Set(keys).size).toBe(messages.length);
  view.unmount();
});

test.each([true, false])(
  "a width change keeps the chat position when at the end is %s",
  (isAtEnd) => {
    let resize: () => void = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    const scroller = Object.assign(new EventTarget(), {
      offsetWidth: 1000,
      clientHeight: 600,
      scrollTop: 0,
      scrollHeight: 1200,
      querySelectorAll: () => [],
    });
    const end = { offsetTop: 1200 };
    const spacer = { style: { setProperty: vi.fn() }, offsetHeight: 0 };
    const view = renderHook(() => {
      const tree = ChatMessages({
        ...branchProperties,
        chatId: "chat",
        messages: [],
        reply: [],
        tools: { runs: {}, ends: {}, shown: undefined, onMove: vi.fn(), onStop: vi.fn() },
        isReplying: false,
      });
      (tree.props as { ref: RefObject<unknown> }).ref.current = scroller;
      findElement<{ ref: RefObject<unknown> }>(
        tree,
        (element) => element.type === "ol",
      ).props.ref.current = {};
      findElement<{ ref: RefObject<unknown> }>(
        tree,
        (element) => element.type === "div" && Object.keys(element.props).length === 1,
      ).props.ref.current = end;
      findElement<{ ref: RefObject<unknown> }>(
        tree,
        (element) => element.props["aria-hidden"] === "true",
      ).props.ref.current = spacer;
      return tree;
    });
    view.render();
    scroller.scrollTop = isAtEnd ? 600 : 200;
    scroller.dispatchEvent(new Event("scroll"));
    scroller.offsetWidth = 580;
    end.offsetTop = 1700;
    scroller.dispatchEvent(new Event("scroll"));
    resize();
    expect(scroller.scrollTop).toBe(isAtEnd ? 1100 : 200);
    end.offsetTop = 1800;
    resize();
    expect(scroller.scrollTop).toBe(isAtEnd ? 1100 : 200);
    view.unmount();
  },
);
