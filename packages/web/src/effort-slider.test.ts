import type { ReactElement } from "react";
import { expect, test, vi } from "vitest";
import { EffortSlider } from "./effort-slider.tsx";
import { findElement, renderHook } from "./render-hook.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());

interface Slider {
  ref: { current: EventTarget | null };
  onChange: (event: { target: { value: string } }) => void;
  "aria-valuetext": string;
}

function sliderOf(tree: ReactElement): Slider {
  return findElement<Slider>(tree, (element) => element.props["aria-label"] === "Thinking effort")
    .props;
}

test("a rejected effort choice returns to the effort reported by the chat", async () => {
  const { promise: pending, reject } = Promise.withResolvers<void>();
  const onChoose = vi.fn(() => pending);
  const element = Object.assign(new EventTarget(), { value: "2" });
  const view = renderHook(() => {
    const tree = EffortSlider({
      thinking: { level: "low", levels: ["low", "medium", "high"] },
      onChoose,
    });
    sliderOf(tree).ref.current = element;
    return tree;
  });
  sliderOf(view.render()).onChange({ target: { value: "2" } });
  expect(sliderOf(view.render())["aria-valuetext"]).toBe("High");
  element.dispatchEvent(new Event("change"));
  expect(onChoose).toHaveBeenCalledWith("high");
  reject(new Error("That thinking level is not available."));
  await pending.catch(() => undefined);
  expect(sliderOf(view.render())["aria-valuetext"]).toBe("Low");
  view.unmount();
});
