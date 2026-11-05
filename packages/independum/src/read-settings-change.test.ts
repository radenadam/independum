import { expect, test } from "vitest";
import { readSettingsChange } from "./read-settings-change.ts";

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
