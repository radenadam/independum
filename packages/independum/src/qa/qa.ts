import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspect } from "node:util";
import { readRevision } from "../../../../scripts/read-revision.ts";
import { checkBrowserDiagnostics } from "./check-browser-diagnostics.ts";
import { type BrowserConnection, connectBrowser } from "./connect-browser.ts";
import { previewOptions } from "./preview-options.ts";
import { readScenario } from "./read-scenario.ts";
import { runScenario } from "./run-scenario.ts";
import { startPreview } from "./start-preview.ts";

const options = previewOptions(process.argv.slice(2), true);
const name = options.scenario ?? "";
const path = name.endsWith(".json")
  ? resolve(process.env.INIT_CWD ?? process.cwd(), name)
  : join(import.meta.dirname, "..", "..", "..", "..", "qa", `${name}.json`);
const scenario = await readScenario(path);
const directory = await mkdtemp(join(tmpdir(), "independum-qa-"));
process.stdout.write(`QA output: ${directory}\n`);
let preview: Awaited<ReturnType<typeof startPreview>> | undefined;
let browser: BrowserConnection | undefined;
const clients = new Map<string, BrowserConnection>();
let isClosing = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    close().finally(() => process.exit(1));
  });
}
try {
  await Promise.all(
    ["values.jsonl", "browser.jsonl", "browser-stderr.txt"].map((file) =>
      writeFile(join(directory, file), ""),
    ),
  );
  await writeFile(join(directory, "scenario.json"), JSON.stringify(scenario, null, 2));
  await writeFile(
    join(directory, "revision.json"),
    JSON.stringify(
      {
        ...readRevision(join(import.meta.dirname, "..", "..", "..", ".."), options.comparison),
        scenario: name,
        platform: `${process.platform} ${process.arch}`,
        driver: "playwright-core",
        browser: options.browser ?? "msedge",
      },
      null,
      2,
    ),
  );
  let url = options.url;
  if (url === undefined) {
    preview = await startPreview({
      ...options,
      hasPhoneRoute: scenario.hasPhoneRoute,
      fixture: process.argv.some(
        (argument) => argument === "--fixture" || argument.startsWith("--fixture="),
      )
        ? options.fixture
        : scenario.fixture,
    });
    url = preview.url;
  }
  const browserOptions =
    preview?.certificatePin === undefined ? {} : { certificatePin: preview.certificatePin };
  browser = await connectBrowser(options.browser, directory, browserOptions);
  await runScenario(browser, url, scenario.steps, directory, async (name) => {
    const client = await connectBrowser(options.browser, directory, browserOptions);
    clients.set(name, client);
    return client;
  });
  for (const client of clients.values()) {
    await client.close();
  }
  await browser.close();
  browser = undefined;
  await checkBrowserDiagnostics(directory);
  process.stdout.write("Scenario passes. Review its screenshots and values.\n");
} catch (error) {
  await writeFile(join(directory, "failure.txt"), inspect(error, { depth: 8 }));
  process.stderr.write(`${inspect(error, { depth: 8 })}\n`);
  process.exitCode = 1;
} finally {
  await close();
}

async function close(): Promise<void> {
  if (isClosing) {
    return;
  }
  isClosing = true;
  try {
    for (const client of clients.values()) {
      await client.close();
    }
    await browser?.close();
  } finally {
    await preview?.close();
  }
}
