import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import type { BrowserConnection } from "./connect-browser.ts";
import type { QaStep } from "./read-scenario.ts";

/** Runs canonical steps through Playwright and retains named checks and screenshots. */
export async function runScenario(
  browser: BrowserConnection,
  url: string,
  steps: QaStep[],
  directory: string,
  createClient?: (name: string) => Promise<BrowserConnection>,
): Promise<void> {
  let client = browser;
  const clients = new Map<string, BrowserConnection>([["owner", browser]]);
  for (const [index, step] of steps.entries()) {
    try {
      if (step.client !== undefined) {
        const selected = clients.get(step.client);
        if (selected === undefined) {
          throw new Error("The scenario client is not open.");
        }
        client = selected;
      }
      if (step.openClient !== undefined) {
        const targetUrl = await evaluate(step.openClient.url);
        if (typeof targetUrl !== "string" || URL.parse(targetUrl) === null || !createClient) {
          throw new Error("Opening a client requires a URL and an isolated browser factory.");
        }
        let selected = clients.get(step.openClient.name);
        if (selected === undefined) {
          selected = await createClient(step.openClient.name);
          clients.set(step.openClient.name, selected);
        }
        client = selected;
        await client.page.goto(targetUrl);
        await setTimeout(2500);
      }
      if (step.size !== undefined) {
        await client.resize(step.size, step.scale ?? 1);
      }
      if (step.scheme !== undefined) {
        await client.page.emulateMedia({ colorScheme: step.scheme });
      }
      if (step.go === true) {
        await client.page.goto(url);
        await setTimeout(2500);
      }
      if (step.run !== undefined) {
        const value = await evaluate(step.run);
        await appendFile(
          join(directory, "values.jsonl"),
          `${JSON.stringify({ step: index + 1, value: value ?? null })}\n`,
        );
        if (
          value === false ||
          (value !== null &&
            typeof value === "object" &&
            Object.values(value).some((part) => part === false))
        ) {
          throw new Error(`Step ${index + 1} returns a failed check.`);
        }
      }
      if (step.key !== undefined) {
        await client.page.keyboard.press(step.key);
      }
      if (step.text !== undefined) {
        await client.page.keyboard.insertText(step.text);
      }
      if (step.clickOn !== undefined) {
        const [x, y] = await pointOf(step.clickOn);
        await client.page.mouse.click(x, y);
      }
      if (step.drag !== undefined) {
        const [x, y] = await pointOf(step.drag.on);
        await client.page.mouse.move(x, y);
        await client.page.mouse.down();
        await client.page.mouse.move(x + step.drag.by[0], y + step.drag.by[1], { steps: 10 });
        await client.page.mouse.up();
      }
      if (step.hoverOn !== undefined) {
        const [x, y] = await pointOf(step.hoverOn);
        await client.page.mouse.move(x, y);
      }
      await setTimeout(step.wait ?? 700);
      if (step.shot !== undefined) {
        await screenshot(step.shot);
      }
    } catch (error) {
      await screenshot("failure").catch(() => undefined);
      throw new Error(`Scenario step ${index + 1} fails.`, { cause: error });
    }
  }

  async function evaluate(expression: string): Promise<unknown> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        client.page.evaluate(expression),
        new Promise<never>((_, reject) => {
          timer = globalThis.setTimeout(
            () => reject(new Error("The step expression exceeds 25 seconds.")),
            25000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function pointOf(expression: string): Promise<[number, number]> {
    const point = await evaluate(
      `(() => { const element = (${expression}); if (Array.isArray(element)) return element; if (!element) throw new Error('The target does not exist.'); element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' }); const box = element.getBoundingClientRect(); if (!box.width || !box.height) throw new Error('The target has no visible size.'); const x = box.left + box.width / 2; const y = box.top + box.height / 2; const hit = document.elementFromPoint(x, y); if (hit === null || !element.contains(hit)) throw new Error('Another element covers the target.'); return [x, y]; })()`,
    );
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !point.every((part) => typeof part === "number" && Number.isFinite(part))
    ) {
      throw new Error("The target must be an element or a pair of coordinates.");
    }
    return point as [number, number];
  }

  async function screenshot(name: string): Promise<void> {
    await client.page.screenshot({ path: join(directory, `${name}.png`) });
  }
}
