import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import type { BrowserConnection } from "./connect-browser.ts";
import type { QaStep } from "./read-scenario.ts";

/** Runs each step in order and saves values and screenshots as they arrive. */
export async function runScenario(
  browser: BrowserConnection,
  url: string,
  steps: QaStep[],
  directory: string,
): Promise<void> {
  const { send } = browser;
  await send("Browser.grantPermissions", {
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
    origin: new URL(url).origin,
  });
  for (const [index, step] of steps.entries()) {
    try {
      if (step.size !== undefined) {
        await send("Emulation.setDeviceMetricsOverride", {
          width: step.size[0],
          height: step.size[1],
          deviceScaleFactor: step.scale ?? 1,
          mobile: step.size[0] < 500,
        });
        await send("Emulation.setTouchEmulationEnabled", { enabled: step.size[0] < 500 });
      }
      if (step.scheme !== undefined) {
        await send("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-color-scheme", value: step.scheme }],
        });
      }
      if (step.go === true) {
        const navigation = await send("Page.navigate", { url });
        if (navigation.errorText !== undefined) {
          throw new Error(`Navigation fails: ${String(navigation.errorText)}.`);
        }
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
        for (const type of ["keyDown", "keyUp"]) {
          await send("Input.dispatchKeyEvent", { ...step.key, type });
        }
      }
      if (step.text !== undefined) {
        await send("Input.insertText", { text: step.text });
      }
      if (step.clickOn !== undefined) {
        const [x, y] = await pointOf(step.clickOn);
        for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
          await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
        }
      }
      if (step.drag !== undefined) {
        const [x, y] = await pointOf(step.drag.on);
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
        await send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x,
          y,
          button: "left",
          buttons: 1,
          clickCount: 1,
        });
        for (const part of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
          await send("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x: x + (step.drag.by[0] * part) / 10,
            y: y + (step.drag.by[1] * part) / 10,
            button: "left",
            buttons: 1,
          });
          await setTimeout(16);
        }
        await send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x: x + step.drag.by[0],
          y: y + step.drag.by[1],
          button: "left",
          buttons: 0,
          clickCount: 1,
        });
      }
      if (step.hoverOn !== undefined) {
        const [x, y] = await pointOf(step.hoverOn);
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
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
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: 25000,
    });
    if (result.exceptionDetails !== undefined) {
      throw new Error(`The step expression fails: ${JSON.stringify(result.exceptionDetails)}.`);
    }
    const remote = result.result as { value?: unknown; unserializableValue?: string };
    return remote.value ?? remote.unserializableValue;
  }

  async function pointOf(expression: string): Promise<[number, number]> {
    const point = await evaluate(
      `(() => { const element = (${expression}); if (Array.isArray(element)) return element; if (!element) throw new Error('The target does not exist.'); const box = element.getBoundingClientRect(); if (!box.width || !box.height) throw new Error('The target has no visible size.'); return [box.left + box.width / 2, box.top + box.height / 2]; })()`,
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
    const result = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(directory, `${name}.png`), Buffer.from(String(result.data), "base64"));
  }
}
