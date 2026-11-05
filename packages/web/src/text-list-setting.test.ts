import type { ComponentProps, ReactElement } from "react";
import { expect, test, vi } from "vitest";
import { findElement, renderHook } from "./render-hook.ts";
import { TextField } from "./text-field.tsx";
import { TextListSetting } from "./text-list-setting.tsx";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());

function typeValue(tree: ReactElement, value: string): void {
  findElement<ComponentProps<typeof TextField>>(
    tree,
    (element) => element.type === TextField,
  ).props.onChange(value);
}

function addValue(tree: ReactElement): void {
  const preventDefault = vi.fn();
  const form = findElement<{ onSubmit: (event: { preventDefault: () => void }) => void }>(
    tree,
    (element) => element.type === "form",
  );
  form.props.onSubmit({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
}

test("adding and removing list entries saves whole values in order", () => {
  const onChange = vi.fn();
  const view = renderHook(() =>
    TextListSetting({ id: "paths", label: "Path", values: ["first"], onChange }),
  );
  const path = "folder with spaces, and a comma";
  typeValue(view.render(), path);
  expect(onChange).not.toHaveBeenCalled();
  addValue(view.render());
  expect(onChange).toHaveBeenCalledExactlyOnceWith(["first", path]);
  expect(
    findElement<ComponentProps<typeof TextField>>(
      view.render(),
      (element) => element.type === TextField,
    ).props.value,
  ).toBe("");
  findElement<{ onClick: () => void }>(
    view.render(),
    (element) => element.props.label === "Remove",
  ).props.onClick();
  expect(onChange).toHaveBeenLastCalledWith([]);
});

test("empty and duplicate entries do not change the list", () => {
  const onChange = vi.fn();
  const view = renderHook(() =>
    TextListSetting({ id: "names", label: "Filename", values: ["AGENTS.md"], onChange }),
  );
  for (const value of ["", "   ", "AGENTS.md"]) {
    typeValue(view.render(), value);
    addValue(view.render());
  }
  expect(onChange).not.toHaveBeenCalled();
});
