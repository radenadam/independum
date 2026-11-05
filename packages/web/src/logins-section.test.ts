import type { ComponentProps, ReactElement } from "react";
import { expect, test, vi } from "vitest";
import { BoxedList } from "./boxed-list.tsx";
import { fetchProviders } from "./login-api.ts";
import { LoginsSection } from "./logins-section.tsx";
import { findElement, renderElement, renderHook } from "./render-hook.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./login-api.ts");

test("a saved login without a provider logo has no empty slot", async () => {
  vi.mocked(fetchProviders).mockResolvedValue([
    {
      id: "faux",
      name: "Faux",
      login: { method: "apiKey", source: "native" },
      account: null,
      apiKey: null,
    },
  ]);
  const view = renderHook(() => LoginsSection({ onChanged: vi.fn() }));
  view.render();
  await Promise.resolve();
  const list = findElement<ComponentProps<typeof BoxedList>>(
    view.render(),
    (element) => element.type === BoxedList,
  );
  const logo = list.props.entries[0]?.leading as ReactElement;
  const logoView = renderHook(() => renderElement(logo));
  expect(logoView.render()).toBeNull();
  logoView.unmount();
  view.unmount();
});
