import { access } from "node:fs/promises";
import { expect, test } from "vitest";
import type { ProviderSummary } from "../api-types.ts";
import { startPreview } from "./start-preview.ts";

test("preview serves the app with token protection and isolates fixture logins", async () => {
  for (const fixture of ["empty", "chats"] as const) {
    const preview = await startPreview({ fixture, port: 0, hasRealLogins: false });
    const url = new URL(preview.url);
    const token = new URLSearchParams(url.hash.slice(1)).get("token");
    const headers = { authorization: `Bearer ${token}` };
    try {
      expect(url.hostname).toBe("127.0.0.1");
      expect((await fetch(new URL("/api/health", url))).status).toBe(401);
      expect((await fetch(new URL("/api/health", url), { headers })).status).toBe(200);
      expect(
        (
          await fetch(new URL("/api/health", url), {
            headers: { ...headers, origin: "http://other.example" },
          })
        ).status,
      ).toBe(403);
      const response = await fetch(new URL("/api/providers", url), { headers });
      const body = (await response.json()) as { providers: ProviderSummary[] };
      const faux = body.providers.find((provider) => provider.id === "faux");
      expect(faux !== undefined && faux.login !== null).toBe(fixture === "chats");
      const html = await fetch(url);
      expect(html.status).toBe(200);
      expect(await html.text()).toContain("/src/main.tsx");
    } finally {
      await preview.close();
    }
    await expect(access(preview.home)).rejects.toThrow();
  }
}, 20000);
