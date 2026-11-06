import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readScenario } from "./read-scenario.ts";

test("every core scenario has a fixture and named checks", async () => {
  const directory = join(import.meta.dirname, "..", "..", "..", "..", "qa");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  expect(names).toHaveLength(18);
  for (const name of names) {
    const scenario = await readScenario(join(directory, name));
    expect(scenario.steps.some((step) => step.run?.startsWith("({"))).toBe(true);
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
