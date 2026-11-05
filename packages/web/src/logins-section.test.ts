import type { ComponentProps, ReactElement } from "react";
import { expect, test, vi } from "vitest";
import { BoxedList } from "./boxed-list.tsx";
import { fetchProviders } from "./login-api.ts";
import { LoginsSection } from "./logins-section.tsx";
import { MenuList } from "./menu-list.tsx";
import { findElement, renderElement, renderHook } from "./render-hook.ts";
import { TextButton } from "./text-button.tsx";

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
  const view = await renderLogins();
  const logo = loginsOf(view.render()).entries[0]?.leading as ReactElement;
  const logoView = renderHook(() => renderElement(logo));
  expect(logoView.render()).toBeNull();
  logoView.unmount();
  view.unmount();
});

test("the logins and providers lists show the source and method of each login", async () => {
  vi.mocked(fetchProviders).mockResolvedValue([
    {
      id: "key-provider",
      name: "Key provider",
      apiKey: { label: "API key", canLogIn: true },
      account: null,
      login: { method: "apiKey", source: "environment variable TEST_API_KEY" },
    },
    {
      id: "account-provider",
      name: "Account provider",
      apiKey: null,
      account: { label: "Test account", buttonLabel: null, isSubscription: true },
      login: { method: "account", source: "stored credential" },
    },
  ]);
  const view = await renderLogins();
  const logins = loginsOf(view.render());
  expect(logins.entries.map((entry) => entry.detail)).toEqual([
    "API key, environment variable TEST_API_KEY",
    "Test account, stored credential",
  ]);
  expect(logins.entries.map((entry) => entry.tooltip)).toEqual([
    "Key provider, API key, environment variable TEST_API_KEY",
    "Account provider, Test account, stored credential",
  ]);
  findElement<ComponentProps<typeof TextButton>>(
    view.render(),
    (element) => element.type === TextButton && element.props.label === "Add a login",
  ).props.onClick?.();
  const providers = findElement<ComponentProps<typeof MenuList>>(
    view.render(),
    (element) => element.type === MenuList,
  );
  expect(
    providers.props.groups.flatMap((group) => group.choices.map((choice) => choice.detail)),
  ).toEqual([
    "connected, API key, environment variable TEST_API_KEY",
    "connected, Test account, stored credential",
  ]);
  view.unmount();
});

async function renderLogins(): Promise<ReturnType<typeof renderHook<ReactElement>>> {
  const view = renderHook(() => LoginsSection({ onChanged: vi.fn() }));
  view.render();
  await Promise.resolve();
  return view;
}

function loginsOf(tree: ReactElement): ComponentProps<typeof BoxedList> {
  return findElement<ComponentProps<typeof BoxedList>>(
    tree,
    (element) => element.type === BoxedList,
  ).props;
}
