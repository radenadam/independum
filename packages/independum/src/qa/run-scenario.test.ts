import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { BrowserConnection } from "./connect-browser.ts";
import { runScenario } from "./run-scenario.ts";

test("scenario records named values and fails a false check with a screenshot", async () => {
  await inScenarioDirectory(async (directory) => {
    const browser = fakeBrowser({ value: { messageVisible: false } });
    await expect(
      runScenario(browser, "http://127.0.0.1:4871", [{ run: "check()", wait: 0 }], directory),
    ).rejects.toThrow("Scenario step 1 fails.");
    expect(JSON.parse(await readFile(join(directory, "values.jsonl"), "utf8"))).toEqual({
      step: 1,
      value: { messageVisible: false },
    });
    expect(await readFile(join(directory, "failure.png"), "utf8")).toBe("screenshot");
  });
});

test("scenario fails an expression exception instead of treating it as a value", async () => {
  await inScenarioDirectory(async (directory) => {
    const browser = fakeBrowser({ exceptionDetails: { text: "Missing element." } });
    await expect(
      runScenario(browser, "http://127.0.0.1:4871", [{ run: "missing()", wait: 0 }], directory),
    ).rejects.toMatchObject({ cause: { message: expect.stringContaining("Missing element.") } });
  });
});

test("scenario preserves input order and dispatches pointer coordinates", async () => {
  await inScenarioDirectory(async (directory) => {
    const calls: { method: string; parameters: Record<string, unknown> }[] = [];
    const browser = fakeBrowser({ value: [25, 40] }, calls);
    await runScenario(
      browser,
      "http://127.0.0.1:4871",
      [
        {
          key: { key: "Enter" },
          text: "hello",
          clickOn: "target",
          hoverOn: "target",
          wait: 0,
          shot: "input",
        },
      ],
      directory,
    );
    expect(
      calls.filter((call) => call.method.startsWith("Input.")).map((call) => call.method),
    ).toEqual([
      "Input.dispatchKeyEvent",
      "Input.dispatchKeyEvent",
      "Input.insertText",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
    ]);
    expect(
      calls
        .filter((call) => call.method === "Input.dispatchMouseEvent")
        .every((call) => call.parameters.x === 25 && call.parameters.y === 40),
    ).toBe(true);
    expect(await readFile(join(directory, "input.png"), "utf8")).toBe("screenshot");
  });
});

test("scenario opens isolated clients without recording their invitation urls", async () => {
  await inScenarioDirectory(async (directory) => {
    const ownerCalls: { method: string; parameters: Record<string, unknown> }[] = [];
    const phoneCalls: { method: string; parameters: Record<string, unknown> }[] = [];
    const owner = fakeBrowser(
      { value: "https://phone.test/#pair=short-lived-fixture" },
      ownerCalls,
    );
    const phone = fakeBrowser({ value: { phoneIsIsolated: true } }, phoneCalls);
    const created: string[] = [];
    await runScenario(
      owner,
      "http://127.0.0.1:4870",
      [
        { openClient: { name: "phone", url: "pairingLink()" }, run: "phoneCheck()", wait: 0 },
        { client: "owner", text: "Owner input", wait: 0 },
      ],
      directory,
      async (name) => {
        created.push(name);
        return phone;
      },
    );
    expect(created).toEqual(["phone"]);
    expect(phoneCalls.some((call) => call.method === "Page.navigate")).toBe(true);
    expect(ownerCalls.at(-1)?.method).toBe("Input.insertText");
    expect(await readFile(join(directory, "values.jsonl"), "utf8")).not.toContain(
      "short-lived-fixture",
    );
  });
});

async function inScenarioDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "independum-run-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function fakeBrowser(
  evaluation: { value?: unknown; exceptionDetails?: unknown },
  calls: { method: string; parameters: Record<string, unknown> }[] = [],
): BrowserConnection {
  return {
    async send(method, parameters = {}) {
      calls.push({ method, parameters });
      if (method === "Runtime.evaluate") {
        return {
          result: { value: evaluation.value },
          exceptionDetails: evaluation.exceptionDetails,
        };
      }
      return method === "Page.captureScreenshot"
        ? { data: Buffer.from("screenshot").toString("base64") }
        : {};
    },
    async close() {},
  };
}
