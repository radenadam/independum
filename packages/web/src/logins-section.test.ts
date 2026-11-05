import type { ProviderSummary } from "independum/api-types";
import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { LoginsSection } from "./logins-section.tsx";

vi.mock("react", async (original) => {
  const module = await original<typeof import("react")>();
  return { ...module, useState: vi.fn(module.useState) };
});

test.each(["logins", "providers"])(
  "the %s list shows the source and method of each login",
  (kind) => {
    const providers: ProviderSummary[] = [
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
    ];
    vi.mocked(useState).mockReturnValueOnce([providers, vi.fn()]);
    vi.mocked(useState).mockReturnValueOnce([{ kind }, vi.fn()]);
    const html = renderToStaticMarkup(createElement(LoginsSection, { onChanged: vi.fn() }));
    expect(html).toContain("API key, environment variable TEST_API_KEY");
    expect(html).toContain("Test account, stored credential");
  },
);
