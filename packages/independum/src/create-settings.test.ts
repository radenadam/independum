import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createSettings, readSettingsChange } from "./create-settings.ts";

const folder = mkdtempSync(join(tmpdir(), "independum-settings-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

test("settings start from their defaults and keep each change across a restart", async () => {
  const path = join(folder, "settings.json");
  const settings = await createSettings(path);
  expect(settings.get()).toEqual({
    shell: null,
    disabledTools: [],
    outputLimits: { maxLines: 2000, maxBytes: 51200 },
  });
  await settings.change({ shell: "bash", disabledTools: ["Shell"] });
  expect((await createSettings(path)).get()).toMatchObject({
    shell: "bash",
    disabledTools: ["Shell"],
  });
});

test("a file edited by hand keeps its valid settings and drops the rest", async () => {
  const path = join(folder, "edited.json");
  writeFileSync(path, JSON.stringify({ shell: "fish", disabledTools: ["Shell"] }));
  expect((await createSettings(path)).get()).toMatchObject({
    shell: null,
    disabledTools: ["Shell"],
  });
});

test("a change with a setting that is not valid is refused whole", () => {
  expect(readSettingsChange({ outputLimits: { maxLines: 500, maxBytes: 4096 } })).toEqual({
    outputLimits: { maxLines: 500, maxBytes: 4096 },
  });
  expect(readSettingsChange({ shell: "bash", outputLimits: { maxLines: 0, maxBytes: 4096 } })).toBe(
    undefined,
  );
  expect(readSettingsChange({ disabledTools: [5] })).toBeUndefined();
  expect(readSettingsChange("everything")).toBeUndefined();
});
