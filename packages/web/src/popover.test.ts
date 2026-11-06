import type { CSSProperties, RefObject } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { Popover } from "./popover.tsx";
import { findElement, renderHook } from "./render-hook.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());

afterEach(() => vi.unstubAllGlobals());

// The pop-up measures this stand-in for its element, because the render has no browser document.
function renderPopover(
  label: string,
  place: Parameters<typeof Popover>[0]["place"],
  element: unknown,
) {
  return renderHook(() => {
    const tree = Popover({ label, place, onClose: vi.fn(), children: null });
    findElement<{ ref: RefObject<unknown> }>(
      tree,
      (candidate) => candidate.props.role === "dialog",
    ).props.ref.current = element;
    return tree;
  });
}

test.each(["above", "below"] as const)(
  "a menu %s its button keeps its opening position",
  (place) => {
    vi.stubGlobal("window", { innerWidth: 1280, innerHeight: 900 });
    vi.stubGlobal("document", { activeElement: null });
    const button = { left: 400, top: 600, bottom: 632, width: 200 };
    class Anchor {
      getBoundingClientRect(): typeof button {
        return button;
      }
    }
    vi.stubGlobal("HTMLElement", Anchor);
    const anchor = new Anchor();
    const element = {
      offsetWidth: 360,
      offsetHeight: 420,
      offsetTop: 8,
      offsetParent: anchor,
      parentElement: anchor,
      closest: () => ({ getBoundingClientRect: () => ({ left: 272, right: 1280 }) }),
      contains: () => false,
      focus: vi.fn(),
    };
    const view = renderPopover("Choose a model", place, element);
    const first = findElement<{ style: CSSProperties }>(
      view.render(),
      (candidate) => candidate.props.role === "dialog",
    ).props.style;
    expect(first).toMatchObject({
      "--left": "320px",
      "--top": "638px",
      "--bottom": "308px",
      "--room": place === "above" ? "584px" : "254px",
    });
    button.width = 180;
    button.top = 580;
    const next = findElement<{ style: CSSProperties }>(
      view.render(),
      (candidate) => candidate.props.role === "dialog",
    ).props.style;
    expect(next).toEqual(first);
    expect(element.focus).toHaveBeenCalledOnce();
    view.unmount();
  },
);

test.each([
  ["takes the focus when it holds no control", false, 1],
  ["leaves the focus on a control inside it", true, 0],
])("a pop-up %s so the escape key reaches it", (_, isFocusInside, focusCalls) => {
  vi.stubGlobal("window", { innerWidth: 1280, innerHeight: 900 });
  vi.stubGlobal("document", { activeElement: {} });
  const element = {
    offsetWidth: 360,
    offsetHeight: 420,
    contains: () => isFocusInside,
    focus: vi.fn(),
  };
  const view = renderPopover("Waiting message", { x: 40, y: 40 }, element);
  view.render();
  expect(element.focus).toHaveBeenCalledTimes(focusCalls);
  view.unmount();
});
