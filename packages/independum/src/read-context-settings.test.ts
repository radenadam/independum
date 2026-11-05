import { expect, test } from "vitest";
import { validateProfileBundle } from "./configuration-schema.ts";
import { builtInContext, piControls, readContextSettings } from "./read-context-settings.ts";

test("partial profile context settings inherit fields and arrays replace defaults", () => {
  const settings = readContextSettings({
    instructions: { names: [] },
    skills: { isAdvertised: false },
  });
  expect(settings.instructions).toEqual({ isEnabled: true, names: [], disabledPaths: [] });
  expect(settings.skills.isAdvertised).toBe(false);
  expect(builtInContext.instructions.names).toEqual(["AGENTS.md", "CLAUDE.md"]);
});

test("every implemented pi control can be disabled and unavailable controls are rejected", () => {
  expect(
    readContextSettings({ pi: { disabled: piControls.map((control) => control.id) } }).pi.disabled,
  ).toHaveLength(piControls.length);
  for (const value of [
    { version: 2 },
    { unknown: false },
    { instructions: { names: ["../AGENTS.md"] } },
    { instructions: { names: ["*"] } },
    { skills: { isEnabled: "false" } },
    { pi: { disabled: ["placeholderTool"] } },
  ]) {
    expect(() => readContextSettings(value)).toThrow();
  }
  expect(() =>
    validateProfileBundle(
      {
        profile: { formatVersion: 1, name: "Profile", settings: { context: { version: 2 } } },
        systemPrompt: null,
        modelTexts: null,
      },
      "profile",
    ),
  ).toThrow("/settings/context/version");
});
