import type { CSSProperties, RefObject } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { Popover } from "./popover.tsx";
import { findElement, renderHook } from "./render-hook.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());

afterEach(() => vi.unstubAllGlobals());

test.each(["above", "below"] as const)(
  "a menu %s its button keeps its opening position",
  (place) => {
    vi.stubGlobal("window", { innerWidth: 1280, innerHeight: 900 });
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
    };
    const view = renderHook(() => {
      const tree = Popover({ label: "Choose a model", place, onClose: vi.fn(), children: null });
      findElement<{ ref: RefObject<unknown> }>(
        tree,
        (candidate) => candidate.props.role === "dialog",
      ).props.ref.current = element;
      return tree;
    });
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
    view.unmount();
  },
);
