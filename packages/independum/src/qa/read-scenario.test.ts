import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readScenario } from "./read-scenario.ts";

test("every core scenario has a fixture and named checks", async () => {
  const directory = join(import.meta.dirname, "..", "..", "..", "..", "qa");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    const scenario = await readScenario(join(directory, name));
    expect(
      scenario.steps.some((step) =>
        /^(\(\{)|return \{/.test(step.run ?? step.waitFor?.condition ?? ""),
      ),
    ).toBe(true);
    expect(scenario.steps.some((step) => step.go || step.openClient)).toBe(true);
    expect(scenario.steps.some((step) => step.shot !== undefined)).toBe(true);
    expect(scenario.steps.every((step) => !("wait" in step))).toBe(true);
  }
});

test("scenario accepts the scratch driver step list and rejects invalid input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "independum-scenario-test-"));
  const path = join(directory, "scenario.json");
  try {
    await writeFile(
      path,
      JSON.stringify([
        { size: [360, 800], scale: 2, scheme: "dark", go: true },
        { run: "({ phoneFits: true })", shot: "phone-dark" },
      ]),
    );
    expect((await readScenario(path)).fixture).toBe("chats");
    for (const value of [
      [],
      [{}],
      [{ shot: "../escape" }],
      [{ hover: [1, 2] }],
      [{ size: [0, 900] }],
      [{ wait: -1 }],
      [{ wait: 700 }],
      [{ waitFor: { condition: "true", timeoutMs: 1000 } }],
      [{ waitFor: { condition: "true", message: "Missing condition.", timeoutMs: 0 } }],
      [{ waitFor: { condition: "true", message: "Missing condition.", timeoutMs: 26000 } }],
      [{ checkQr: { on: "image", name: "../escape" } }],
      [{ key: { key: "Enter" } }],
      [{ drag: { on: "null", by: [1] } }],
      [{ client: "../escape" }],
      [{ openClient: { name: "phone", url: 4 } }],
      { fixture: "missing", steps: [{ go: true }] },
    ]) {
      await writeFile(path, JSON.stringify(value));
      await expect(readScenario(path)).rejects.toThrow();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("conditions require a bounded timeout and a failure message", async () => {
  const directory = await mkdtemp(join(tmpdir(), "independum-condition-test-"));
  try {
    const path = join(directory, "scenario.json");
    const steps = [
      {
        waitFor: {
          condition: "() => true",
          message: "The phone name does not refresh.",
          timeoutMs: 5000,
        },
        checkQr: { on: "document.querySelector('img')", name: "rendered-qr" },
      },
    ];
    await writeFile(path, JSON.stringify(steps));
    expect((await readScenario(path)).steps).toEqual(steps);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
