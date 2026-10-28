import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { builtInSettings, createSettings, readSettingsChange } from "./create-settings.ts";

const folder = mkdtempSync(join(tmpdir(), "independum-settings-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

test("settings start from their defaults and keep each change across a restart", async () => {
  const path = join(folder, "settings.json");
  const settings = await createSettings(path);
  expect(settings.get()).toEqual({
    shell: null,
    disabledTools: [],
    outputLimits: { maxLines: 2000, maxBytes: 51200 },
    texts: {},
  });
  const texts = { "shell.description": { text: "Runs it.", builtIn: "Runs a command." } };
  await settings.change({ shell: "bash", disabledTools: ["Shell"], texts });
  expect((await createSettings(path)).get()).toMatchObject({
    shell: "bash",
    disabledTools: ["Shell"],
    texts,
  });
});

test("a file edited by hand keeps its valid settings and drops the rest", async () => {
  const path = join(folder, "edited.json");
  writeFileSync(
    path,
    JSON.stringify({
      shell: "fish",
      disabledTools: ["Shell"],
      texts: { kept: { text: "A.", builtIn: "B." }, dropped: { text: "A." } },
    }),
  );
  expect((await createSettings(path)).get()).toMatchObject({
    shell: null,
    disabledTools: ["Shell"],
    texts: { kept: { text: "A.", builtIn: "B." } },
  });
});

test("a file with a byte order mark keeps its settings, and a file that is not JSON gives the built-in ones", async () => {
  const marked = join(folder, "marked.json");
  writeFileSync(marked, `\uFEFF${JSON.stringify({ shell: "bash" })}`);
  expect((await createSettings(marked)).get().shell).toBe("bash");
  const broken = join(folder, "broken.json");
  writeFileSync(broken, "{ shell: ");
  expect((await createSettings(broken)).get()).toEqual(builtInSettings);
});

test("a change with a setting that is not valid is refused whole", () => {
  expect(readSettingsChange({ outputLimits: { maxLines: 500, maxBytes: 4096 } })).toEqual({
    outputLimits: { maxLines: 500, maxBytes: 4096 },
  });
  expect(readSettingsChange({ shell: "bash", outputLimits: { maxLines: 0, maxBytes: 4096 } })).toBe(
    undefined,
  );
  expect(readSettingsChange({ disabledTools: [5] })).toBeUndefined();
  expect(readSettingsChange({ texts: { a: "Text.", b: null } })).toEqual({
    texts: { a: "Text.", b: null },
  });
  expect(readSettingsChange({ texts: { a: 5 } })).toBeUndefined();
  expect(readSettingsChange("everything")).toBeUndefined();
});
