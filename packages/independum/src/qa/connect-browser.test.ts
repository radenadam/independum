import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { checkBrowserDiagnostics } from "./check-browser-diagnostics.ts";
import { connectBrowser } from "./connect-browser.ts";
import { runScenario } from "./run-scenario.ts";

// Deterministic checks stay browser free. Capable QA hosts explicitly select an installed browser.
const selection = process.env.INDEPENDUM_QA_BROWSER;

test.skipIf(selection === undefined)(
  "real playwright diagnostics each reject an otherwise successful scenario",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "independum-diagnostics-"));
    let browser: Awaited<ReturnType<typeof connectBrowser>> | undefined;
    try {
      browser = await connectBrowser(selection, directory);
      // Routes terminate in Playwright, so the deliberately failed requests never reach a network.
      await browser.page.route("https://diagnostics.invalid/**", async (route) => {
        if (route.request().url().endsWith("/failed")) {
          await route.abort("failed");
        } else {
          await route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" } });
        }
      });
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
              wait: 0,
            },
          ],
          directory,
        );
        await expect
          .poll(async () => {
            const lines = await readFile(join(directory, "browser.jsonl"), "utf8");
            return lines
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((line) => JSON.parse(line));
          })
          .toContainEqual({ kind, message: expect.stringContaining(expected) });
        await expect(checkBrowserDiagnostics(directory)).rejects.toThrow(
          "The browser reports errors or warnings.",
        );
      }
    } finally {
      await browser?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);
