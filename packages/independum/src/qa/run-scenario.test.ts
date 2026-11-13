import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { expect, test } from "vitest";
import type { BrowserConnection } from "./connect-browser.ts";
import { runScenario } from "./run-scenario.ts";

test("false checks retain named evidence and a failure screenshot", async () => {
  await inScenario(async (directory) => {
    const browser = fakeBrowser({ messageVisible: false });
    await expect(
      runScenario(browser, "http://127.0.0.1", [{ run: "check()" }], directory),
    ).rejects.toThrow("Scenario step 1 fails.");
    expect(JSON.parse(await readFile(join(directory, "values.jsonl"), "utf8"))).toEqual({
      step: 1,
      value: { messageVisible: false },
    });
    expect(await readFile(join(directory, "failure.png"), "utf8")).toBe("image");
  });
});

test("expression exceptions fail instead of becoming successful values", async () => {
  await inScenario(async (directory) => {
    const browser = fakeBrowser(new Error("Missing element."));
    await expect(
      runScenario(browser, "http://127.0.0.1", [{ run: "missing()" }], directory),
    ).rejects.toMatchObject({ cause: { message: "Missing element." } });
  });
});

test("condition timeouts retain their reason and stop later actions", async () => {
  await inScenario(async (directory) => {
    const browser = fakeBrowser(true);
    async function timeOut(): Promise<never> {
      throw new Error("Timeout.");
    }
    browser.page.waitForFunction = timeOut;
    await expect(
      runScenario(
        browser,
        "http://127.0.0.1",
        [
          {
            waitFor: {
              condition: "() => false",
              message: "The owner does not see the renamed phone.",
              timeoutMs: 1000,
            },
            run: "unreachable()",
          },
        ],
        directory,
      ),
    ).rejects.toMatchObject({ cause: { message: "The owner does not see the renamed phone." } });
  });
});

test("playwright preserves key text pointer and capture order", async () => {
  await inScenario(async (directory) => {
    const calls: string[] = [];
    await runScenario(
      fakeBrowser([25, 40], calls),
      "http://127.0.0.1",
      [{ key: "Control+Enter", text: "hello", clickOn: "target", hoverOn: "target" }],
      directory,
    );
    expect(calls).toEqual([
      "key Control+Enter",
      "text hello",
      "evaluate",
      "click 25 40",
      "evaluate",
      "move 25 40",
    ]);
  });
});

test("isolated clients do not put invitation urls into named values", async () => {
  await inScenario(async (directory) => {
    const ownerCalls: string[] = [];
    const phoneCalls: string[] = [];
    await runScenario(
      fakeBrowser("https://phone.test/#pair=fixture", ownerCalls),
      "http://127.0.0.1",
      [
        { openClient: { name: "phone", url: "invitation()" }, run: "check()" },
        { client: "owner", text: "owner" },
      ],
      directory,
      async () => fakeBrowser({ isolated: true }, phoneCalls),
    );
    expect(phoneCalls).toContain("go https://phone.test/#pair=fixture");
    expect(ownerCalls.at(-1)).toBe("text owner");
    expect(await readFile(join(directory, "values.jsonl"), "utf8")).not.toContain("pair=fixture");
  });
});

async function inScenario(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "independum-scenario-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function fakeBrowser(value: unknown, calls: string[] = []): BrowserConnection {
  const page = {
    async evaluate() {
      calls.push("evaluate");
      if (value instanceof Error) {
        throw value;
      }
      return value;
    },
    async waitForFunction() {
      return {
        async jsonValue() {
          return true;
        },
        async dispose() {},
      };
    },
    async goto(url: string) {
      calls.push(`go ${url}`);
    },
    async screenshot(options: { path: string }) {
      await writeFile(options.path, "image");
    },
    keyboard: {
      async press(key: string) {
        calls.push(`key ${key}`);
      },
      async insertText(text: string) {
        calls.push(`text ${text}`);
      },
    },
    mouse: {
      async click(x: number, y: number) {
        calls.push(`click ${x} ${y}`);
      },
      async move(x: number, y: number) {
        calls.push(`move ${x} ${y}`);
      },
    },
  } as unknown as Page;
  return { page, async resize() {}, async close() {} };
}
