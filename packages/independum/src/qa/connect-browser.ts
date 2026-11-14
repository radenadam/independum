import { appendFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { chromium, type Page } from "playwright-core";

export interface BrowserConnection {
  page: Page;
  resize(size: [number, number], scale: number): Promise<void>;
  expectDisconnection(isExpected: boolean): void;
  close(): Promise<void>;
}

// These are the failures of a request whose server does not listen, or stops while it answers.
const unreachableServer =
  /net::ERR_(?:CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE|INCOMPLETE_CHUNKED_ENCODING)/;

/** Starts Playwright with an installed browser and records diagnostics before navigation. */
export async function connectBrowser(
  selection: string | undefined,
  directory: string,
  options: { certificatePin?: string } = {},
): Promise<BrowserConnection> {
  const channel = selection ?? "msedge";
  let isDisconnectionExpected = false;
  const browser = await chromium.launch({
    ...(isAbsolute(channel) ? { executablePath: channel } : { channel }),
    headless: true,
    args: [
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      ...(options.certificatePin === undefined
        ? []
        : [
            `--ignore-certificate-errors-spki-list=${options.certificatePin}`,
            "--host-resolver-rules=MAP phone.test 127.0.0.1",
            "--no-proxy-server",
          ]),
    ],
    logger: {
      isEnabled: (name) => name === "browser",
      log(name, severity, message) {
        appendFileSync(
          join(directory, "browser-stderr.txt"),
          `${name} ${severity}: ${String(message)}\n`,
        );
      },
    },
  });
  try {
    const context = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
    const emulation = await context.newCDPSession(page);
    await emulation.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    page.on("pageerror", (error) => record("exception", error.message));
    page.on("crash", () => record("crash", "The browser page crashes."));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type()) && !isFavicon(message.location().url)) {
        record(message.type(), message.text());
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !isFavicon(response.url())) {
        record("response", `${response.status()} ${response.url()}`);
      }
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText ?? "Unknown request failure.";
      if (!failure.includes("ERR_ABORTED") && !isFavicon(request.url())) {
        record("request", `${request.url()} ${failure}`);
      }
    });
    appendFileSync(
      join(directory, "browser-stderr.txt"),
      `Playwright browser ${browser.version()} with ${channel}.\n`,
    );
    return {
      page,
      async resize(size, scale) {
        await page.setViewportSize({ width: size[0], height: size[1] });
        // Playwright fixes touch and pixel ratio at context creation, but scenarios resize live UI.
        await emulation.send("Emulation.setDeviceMetricsOverride", {
          width: size[0],
          height: size[1],
          deviceScaleFactor: scale,
          mobile: size[0] < 500,
        });
        await emulation.send("Emulation.setTouchEmulationEnabled", { enabled: size[0] < 500 });
      },
      expectDisconnection(isExpected) {
        isDisconnectionExpected = isExpected;
      },
      async close() {
        await browser.close();
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }

  // A restart stops the server on purpose, so requests that cannot reach it meanwhile are kept apart
  // as evidence of the restart instead of failing the run.
  function record(kind: string, message: string): void {
    const file =
      isDisconnectionExpected && unreachableServer.test(message)
        ? "restart.jsonl"
        : "browser.jsonl";
    appendFileSync(join(directory, file), `${JSON.stringify({ kind, message })}\n`);
  }
}

function isFavicon(url: string): boolean {
  return URL.parse(url)?.pathname === "/favicon.ico";
}
