import type { ChatMessage, ChatState } from "independum/api-types";
import type { ReactElement, RefObject } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { ChatMessages } from "./chat-messages.tsx";
import { findElement, renderElement, renderHook } from "./render-hook.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());

afterEach(() => vi.unstubAllGlobals());

const messageProperties = {
  chat: { branchSelectionId: null } as ChatState,
  models: undefined,
  onEdit: vi.fn(),
  onOpenModels: vi.fn(),
  onManageLogins: vi.fn(),
  chatId: "chat",
  reply: [],
  tools: { runs: {}, ends: {}, shown: undefined, onMove: vi.fn(), onStop: vi.fn() },
  isReplying: false,
};

test.each([
  { isStopped: true, error: "Stopped", tone: "quiet" },
  { isStopped: false, error: "This operation was aborted", tone: "alert" },
  { isStopped: false, error: "The provider is unavailable.", tone: "alert" },
])("a reply shows $error in the $tone tone", ({ isStopped, error, tone }) => {
  const messages: ChatMessage[] = [
    {
      role: "assistant",
      parts: [{ type: "text", text: "Partial reply." }],
      timestamp: 123,
      durationMs: null,
      isStopped,
      error,
      commandEnd: null,
    },
  ];
  const view = renderHook(() => {
    const tree = ChatMessages({
      ...messageProperties,
      messages,
    });
    return renderElement(
      findElement(
        tree,
        (element) =>
          Array.isArray(element.props.messages) && element.props.messages[0] === messages[0],
      ),
    );
  });
  const status = findElement<{ children: string; "data-tone": string }>(
    view.render(),
    (element) => element.type === "p" && element.props["data-tone"] !== undefined,
  );
  expect(status.props.children).toBe(error);
  expect(status.props["data-tone"]).toBe(tone);
  view.unmount();
});

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
      ...messageProperties,
      messages,
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
        ...messageProperties,
        messages: [],
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
