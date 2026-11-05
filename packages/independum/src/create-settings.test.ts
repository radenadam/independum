import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test, vi } from "vitest";
import { builtInSettings, createSettings, readSettingsChange } from "./create-settings.ts";

vi.mock("node:fs/promises", { spy: true });

const folder = mkdtempSync(join(tmpdir(), "independum-settings-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

test("settings start from their defaults and keep each change across a restart", async () => {
  const path = join(folder, "settings.json");
  const settings = await createSettings(path);
  expect(settings.get()).toEqual(builtInSettings);
  const texts = { "shell.description": { text: "Runs it.", builtIn: "Runs a command." } };
  const next = {
    shell: "bash" as const,
    disabledTools: ["Shell"],
    texts,
    disabledFacts: ["facts.pi"],
    knowledgeCutoffs: { provider: { model: "2026-04" } },
    modelOverrides: { provider: { model: { contextWindow: 200_000, temperature: 0.4 } } },
    compaction: { isEnabled: false, reserveTokens: 600, keepRecentTokens: 300 },
  };
  await settings.change(next);
  expect((await createSettings(path)).get()).toMatchObject(next);
});

test("overlapping changes persist in order and a failed save does not block the next one", async () => {
  const path = join(folder, "overlapping.json");
  const settings = await createSettings(path);
  const original = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writeCount = vi.mocked(writeFile).mock.calls.length;
  vi.mocked(writeFile).mockImplementationOnce(async (...arguments_) => {
    started.resolve();
    await release.promise;
    await original.writeFile(...arguments_);
  });
  const first = settings.change({ disabledTools: ["Read"] });
  await started.promise;
  const second = settings.change({ shell: "bash" });
  try {
    expect(writeFile).toHaveBeenCalledTimes(writeCount + 1);
  } finally {
    release.resolve();
    await Promise.all([first, second]);
  }
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(settings.get());
  expect((await createSettings(path)).get()).toMatchObject({
    disabledTools: ["Read"],
    shell: "bash",
  });
  vi.mocked(writeFile).mockRejectedValueOnce(new Error("The disk is full."));
  await expect(settings.change({ handBackSeconds: 60 })).rejects.toThrow("The disk is full.");
  await settings.change({ handBackSeconds: 300 });
  expect((await createSettings(path)).get().handBackSeconds).toBe(300);
});

test("changes to separate tools compose before either save finishes", async () => {
  const path = join(folder, "tools.json");
  const settings = await createSettings(path);
  await Promise.all([
    settings.change({ tool: { name: "Read", isEnabled: false } }),
    settings.change({ tool: { name: "Write", isEnabled: false } }),
  ]);
  expect((await createSettings(path)).get().disabledTools).toEqual(["Read", "Write"]);
  await settings.change({ tool: { name: "Read", isEnabled: true } });
  expect(settings.get().disabledTools).toEqual(["Write"]);
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
  expect(readSettingsChange({ tool: { name: "Read", isEnabled: false } })).toEqual({
    tool: { name: "Read", isEnabled: false },
  });
  expect(readSettingsChange({ tool: { name: "Read", isEnabled: "false" } })).toBeUndefined();
  expect(readSettingsChange({ tool: null })).toBeUndefined();
  expect(readSettingsChange({ outputLimits: { maxLines: 500, maxBytes: 4096 } })).toEqual({
    outputLimits: { maxLines: 500, maxBytes: 4096 },
  });
  expect(readSettingsChange({ shell: "bash", outputLimits: { maxLines: 0, maxBytes: 4096 } })).toBe(
    undefined,
  );
  expect(readSettingsChange({ disabledTools: [5] })).toBeUndefined();
  expect(readSettingsChange({ disabledFacts: [5] })).toBeUndefined();
  expect(readSettingsChange({ knowledgeCutoffs: { provider: { model: 5 } } })).toBeUndefined();
  expect(readSettingsChange({ knowledgeCutoffs: { provider: { model: "" } } })).toBeUndefined();
  expect(readSettingsChange({ knowledgeCutoffs: { provider: [] } })).toBeUndefined();
  expect(readSettingsChange({ knowledgeCutoffs: { provider: { model: "2026-04" } } })).toEqual({
    knowledgeCutoffs: { provider: { model: "2026-04" } },
  });
  expect(readSettingsChange({ texts: { a: "Text.", b: null } })).toEqual({
    texts: { a: "Text.", b: null },
  });
  expect(readSettingsChange({ texts: { a: 5 } })).toBeUndefined();
  // biome-ignore-start lint/style/useNamingConvention: Shells name environment variables in capitals.
  expect(readSettingsChange({ environment: { GIT_EDITOR: "true" } })).toEqual({
    environment: { GIT_EDITOR: "true" },
  });
  expect(readSettingsChange({ environment: { "NOT A NAME": "x" } })).toBeUndefined();
  expect(readSettingsChange({ environment: { NAME: 1 } })).toBeUndefined();
  // biome-ignore-end lint/style/useNamingConvention: Shells name environment variables in capitals.
  expect(readSettingsChange("everything")).toBeUndefined();
});
