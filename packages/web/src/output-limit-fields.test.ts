import type { OutputLimits } from "independum/api-types";
import { type DependencyList, useEffect, useEffectEvent, useState } from "react";
import { expect, test, vi } from "vitest";
import { OutputLimitFields } from "./output-limit-fields.tsx";

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original, useEffect: vi.fn(), useEffectEvent: vi.fn(), useState: vi.fn() };
});

test("output limits save after typing even while renders replace the change handler", () => {
  vi.useFakeTimers();
  let dependencies: DependencyList | undefined;
  let cleanup: (() => void) | undefined;
  let onChange: (limits: OutputLimits) => void = vi.fn();
  function save(limits: OutputLimits): void {
    onChange(limits);
  }
  vi.mocked(useState).mockImplementation(
    (initial?: unknown): ReturnType<typeof useState> => [
      initial === "2000" ? "3000" : initial,
      vi.fn(),
    ],
  );
  vi.mocked(useEffectEvent<typeof onChange>).mockImplementation((callback) => {
    onChange = callback;
    return save;
  });
  vi.mocked(useEffect).mockImplementation((effect, next) => {
    if (
      dependencies !== undefined &&
      next?.every((value, index) => value === dependencies?.[index])
    ) {
      return;
    }
    cleanup?.();
    dependencies = next;
    cleanup = effect() ?? undefined;
  });
  const limits = { maxLines: 2000, maxBytes: 51200 };
  const first = vi.fn();
  const latest = vi.fn();
  try {
    OutputLimitFields({ limits, onChange: first });
    vi.advanceTimersByTime(300);
    OutputLimitFields({ limits: { ...limits }, onChange: latest });
    vi.advanceTimersByTime(299);
    expect(latest).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(latest).toHaveBeenCalledExactlyOnceWith({ maxLines: 3000, maxBytes: 51200 });
    expect(first).not.toHaveBeenCalled();
  } finally {
    cleanup?.();
    vi.useRealTimers();
  }
});
