import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { waitFor } from "../../../../scripts/wait-for.ts";
import { checkBrowserDiagnostics } from "./check-browser-diagnostics.ts";
import { type BrowserConnection, connectBrowser } from "./connect-browser.ts";
import { runScenario } from "./run-scenario.ts";

// Deterministic checks stay browser free. Capable QA hosts explicitly select an installed browser.
const selection = process.env.INDEPENDUM_QA_BROWSER;
const optIn = {
  timeout: 60000,
  meta: {
    skipReason: "INDEPENDUM_QA_BROWSER does not select an installed browser for this opt-in test.",
  },
};

test.skipIf(selection === undefined)(
  "real playwright diagnostics each reject an otherwise successful scenario",
  optIn,
  async () => {
    await withDiagnosticsBrowser(async (browser, directory) => {
      for (const [kind, script, expected] of [
        ["error", "console.error('QA browser error.');", "QA browser error."],
        ["warning", "console.warn('QA browser warning.');", "QA browser warning."],
        [
          "exception",
          "setTimeout(() => { throw new Error('QA page exception.'); }, 0);",
          "QA page exception.",
        ],
        ["request", "fetch('https://diagnostics.invalid/failed').catch(() => {});", "/failed"],
        ["response", "fetch('https://diagnostics.invalid/status').catch(() => {});", "503"],
      ] as const) {
        await writeFile(join(directory, "browser.jsonl"), "");
        await expect(checkBrowserDiagnostics(directory)).resolves.toBeUndefined();
        const url = `data:text/html,${encodeURIComponent(`<h1>Diagnostic fixture</h1><script>${script}</script>`)}`;
        await runScenario(
          browser,
          url,
          [
            {
              go: true,
              run: "({ diagnosticPageLoaded: document.querySelector('h1').textContent === 'Diagnostic fixture' })",
            },
          ],
          directory,
        );
        await waitFor(async () => {
          const lines = await readFile(join(directory, "browser.jsonl"), "utf8");
          expect(
            lines
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((line) => JSON.parse(line)),
          ).toContainEqual({ kind, message: expect.stringContaining(expected) });
        });
        await expect(checkBrowserDiagnostics(directory)).rejects.toThrow(
          "The browser reports errors or warnings.",
        );
      }
    });
  },
);

test.skipIf(selection === undefined)(
  "a restart step keeps unreachable server failures apart and still rejects other failures",
  optIn,
  async () => {
    await withDiagnosticsBrowser(async (browser, directory) => {
      await writeFile(join(directory, "browser.jsonl"), "");
      const fetchBoth =
        "Promise.all(['refused', 'status'].map(path => fetch('https://diagnostics.invalid/' + path).then(() => true, () => true))).then(() => ({ bothFetched: true }))";
      await runScenario(
        browser,
        `data:text/html,${encodeURIComponent("<h1>Restart fixture</h1>")}`,
        [
          { go: true },
          {
            restart: true,
            waitFor: { condition: fetchBoth, message: "The fetches do not end.", timeoutMs: 5000 },
          },
        ],
        directory,
        undefined,
        async () => {},
      );
      await waitFor(async () => {
        expect(await readFile(join(directory, "restart.jsonl"), "utf8")).toContain(
          "net::ERR_CONNECTION_REFUSED",
        );
        const diagnostics = await readFile(join(directory, "browser.jsonl"), "utf8");
        expect(diagnostics).toContain("503");
        expect(diagnostics).not.toContain("ERR_CONNECTION_REFUSED");
      });
      await expect(checkBrowserDiagnostics(directory)).rejects.toThrow(
        "The browser reports errors or warnings.",
      );
    });
  },
);

async function withDiagnosticsBrowser(
  run: (browser: BrowserConnection, directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "independum-diagnostics-"));
  let browser: BrowserConnection | undefined;
  try {
    browser = await connectBrowser(selection, directory);
    // Routes terminate in Playwright, so the deliberately failed requests never reach a network.
    await browser.page.route("https://diagnostics.invalid/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/failed" || path === "/refused") {
        await route.abort(path === "/failed" ? "failed" : "connectionrefused");
      } else {
        await route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" } });
      }
    });
    await run(browser, directory);
  } finally {
    await browser?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
