import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderSVG } from "uqr";
import { expect, test } from "vitest";
import { checkRenderedQr } from "./check-rendered-qr.ts";
import { connectBrowser } from "./connect-browser.ts";
import { runScenario } from "./run-scenario.ts";

const selection = process.env.INDEPENDUM_QA_BROWSER;

test.skipIf(selection === undefined)(
  "rendered qr checks reject blank captures despite a decoded source and survive theme changes",
  {
    timeout: 30000,
    meta: {
      skipReason:
        "INDEPENDUM_QA_BROWSER does not select an installed browser for this opt-in test.",
    },
  },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "independum-qr-test-"));
    const browser = await connectBrowser(selection, directory);
    try {
      await browser.page.route("**/*", (route) => route.abort());
      const styles = (
        await Promise.all(
          ["theme.css", "modal-dialog.module.css", "phone-access-section.module.css"].map((file) =>
            readFile(new URL(`../../../web/src/${file}`, import.meta.url), "utf8"),
          ),
        )
      ).join("\n");
      const svg = renderSVG("https://phone.test/#pair=offline-fixture", { border: 4, ecc: "M" });
      await browser.page.setContent(
        `<meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style><dialog class="dialog fullOnPhone"><img class="qr" alt="Pairing QR code" width="240" height="240" src="data:image/svg+xml,${encodeURIComponent(svg)}"></dialog><script>document.querySelector('dialog').showModal()</script>`,
      );
      const target = { on: "document.querySelector('img')", name: "rendered-qr" };
      await browser.page.evaluate(`(() => {
        setTimeout(() => document.body.setAttribute("data-phone-name", "My phone"), 1100);
      })()`);
      await runScenario(
        browser,
        "about:blank",
        [
          {
            waitFor: {
              condition:
                "({ ownerSeesRenamedPhone: document.body.getAttribute('data-phone-name') === 'My phone' })",
              message: "The owner does not see the renamed phone.",
              timeoutMs: 3000,
            },
          },
        ],
        directory,
      );
      await expect(
        runScenario(
          browser,
          "about:blank",
          [
            {
              waitFor: {
                condition: "() => false",
                message: "The owner does not see the renamed phone.",
                timeoutMs: 50,
              },
            },
          ],
          directory,
        ),
      ).rejects.toMatchObject({ cause: { message: "The owner does not see the renamed phone." } });
      expect(JSON.parse((await readFile(join(directory, "values.jsonl"), "utf8")).trim())).toEqual({
        step: 1,
        value: { ownerSeesRenamedPhone: true },
      });
      for (const scheme of ["dark", "light", "dark", "light"] as const) {
        await browser.resize([360, 800], 1);
        await browser.page.emulateMedia({ colorScheme: scheme });
        await expect(checkRenderedQr(browser.page, target, directory)).resolves.toEqual({
          qrHasBlackModules: true,
          qrHasWhiteBackground: true,
        });
      }
      await browser.page.addStyleTag({ content: "img { filter: brightness(0) invert(1); }" });
      expect(
        await browser.page.evaluate(
          "(() => { const image = document.querySelector('img'); return image.complete && image.naturalWidth > 0 && image.checkVisibility(); })()",
        ),
      ).toBe(true);
      await expect(checkRenderedQr(browser.page, target, directory)).rejects.toThrow(
        "The rendered QR stays blank or lacks contrast",
      );
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
