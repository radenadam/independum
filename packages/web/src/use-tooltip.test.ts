import type { FocusEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import { afterEach, expect, test, vi } from "vitest";
import { renderHook } from "./render-hook.ts";
import { useTooltip } from "./use-tooltip.tsx";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("react-dom", () => ({ createPortal: vi.fn(() => null) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test.each([
  { input: "mouse", hasDialog: true },
  { input: "keyboard", hasDialog: true },
  { input: "mouse", hasDialog: false },
])(
  "a $input tooltip uses its containing layer when a dialog is $hasDialog",
  ({ input, hasDialog }) => {
    const body = {};
    const dialog = {};
    vi.stubGlobal("document", { body });
    vi.stubGlobal("window", { innerWidth: 1280, innerHeight: 900 });
    const currentTarget = {
      getBoundingClientRect: () => ({ left: 300, right: 500, top: 200, bottom: 230 }),
      closest: () => (hasDialog ? dialog : null),
      matches: () => true,
    } as unknown as HTMLElement;
    const view = renderHook(() => useTooltip("A complete archived title"));
    const tip = view.render();
    if (input === "mouse") {
      tip.handlers.onPointerEnter({
        currentTarget,
        pointerType: "mouse",
      } as PointerEvent<HTMLElement>);
    } else {
      tip.handlers.onFocus({ currentTarget } as FocusEvent<HTMLElement>);
    }
    view.render();
    expect(createPortal).toHaveBeenLastCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ role: "tooltip", children: "A complete archived title" }),
      }),
      hasDialog ? dialog : body,
    );
    expect(vi.mocked(createPortal).mock.lastCall?.[1]).toBe(hasDialog ? dialog : body);
    tip.handlers.onBlur();
    expect(view.render().tooltip).toBeNull();
    view.unmount();
  },
);
