import { afterEach, expect, test, vi } from "vitest";
import { ColumnHandle } from "./column-handle.tsx";
import { findElement, renderHook } from "./render-hook.ts";
import { SlidingColumn } from "./sliding-column.tsx";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());

afterEach(() => vi.unstubAllGlobals());

test("a wide panel fits a narrower window and resizes from its displayed width", () => {
  const viewport = Object.assign(new EventTarget(), { innerWidth: 1800 });
  vi.stubGlobal("window", viewport);
  vi.stubGlobal("localStorage", { getItem: () => "960", setItem: vi.fn() });
  const view = renderHook(() =>
    SlidingColumn({
      element: "aside",
      label: "Side panel",
      edge: "end",
      isOpen: true,
      children: null,
    }),
  );
  function handle(): { width: number; onResize: (width: number, isDone: boolean) => void } {
    return findElement<{ width: number; onResize: (width: number, isDone: boolean) => void }>(
      view.render(),
      (element) => element.type === ColumnHandle,
    ).props;
  }
  expect(handle().width).toBe(960);
  viewport.innerWidth = 1000;
  viewport.dispatchEvent(new Event("resize"));
  expect(handle().width).toBe(520);
  viewport.innerWidth = 1800;
  viewport.dispatchEvent(new Event("resize"));
  expect(handle().width).toBe(960);
  viewport.innerWidth = 1000;
  viewport.dispatchEvent(new Event("resize"));
  handle().onResize(500, true);
  expect(handle().width).toBe(500);
  expect(localStorage.setItem).toHaveBeenCalledWith("independum.sidePanelWidth", "500");
  viewport.innerWidth = 1800;
  viewport.dispatchEvent(new Event("resize"));
  expect(handle().width).toBe(500);
  view.unmount();
});
