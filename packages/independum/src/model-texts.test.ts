import { expect, test } from "vitest";
import type { EditedText } from "./api-types.ts";
import { changeTexts, createModelTexts, defineText, summarizeTexts } from "./model-texts.ts";

const timedOut = defineText({
  id: "test.timedOut",
  group: "Test",
  section: "result",
  label: "When the timeout fires",
  builtIn: "Stopped at its timeout of {timeout} s.",
  slots: { timeout: { meaning: "The timeout in seconds.", example: "30" } },
});
const description = defineText({
  id: "test.description",
  group: "Test",
  section: "description",
  label: "Description",
  builtIn: "Runs a test.",
  slots: {},
});

test("a text reads the edit of the user, or else its built-in text", () => {
  const edited: Record<string, EditedText> = {
    "test.timedOut": { text: "Timeout {timeout} reached.", builtIn: timedOut.builtIn },
  };
  const texts = createModelTexts(() => edited);
  expect(texts.fill(timedOut, { timeout: 5 })).toBe("Timeout 5 reached.");
  expect(texts.get(description)).toBe("Runs a test.");
});

test("a text shows the built-in text that its edit started from once that changes", () => {
  const [current, changed] = summarizeTexts([timedOut, description], {
    "test.timedOut": { text: "Mine.", builtIn: timedOut.builtIn },
    "test.description": { text: "Mine too.", builtIn: "An older built-in text." },
  });
  expect(current).toMatchObject({ text: "Mine.", isEdited: true, editedFrom: null });
  expect(current?.slots).toEqual([
    { name: "timeout", meaning: "The timeout in seconds.", example: "30" },
  ]);
  expect(changed).toMatchObject({ isEdited: true, editedFrom: "An older built-in text." });
});

test("a change edits texts, resets them with null or their built-in text, and refuses unknown ones", () => {
  const texts = [timedOut, description];
  const edited = changeTexts(texts, {}, { "test.description": "Mine." });
  expect(edited).toEqual({ "test.description": { text: "Mine.", builtIn: "Runs a test." } });
  expect(changeTexts(texts, edited ?? {}, { "test.description": null })).toEqual({});
  expect(changeTexts(texts, edited ?? {}, { "test.description": "Runs a test." })).toEqual({});
  expect(changeTexts(texts, {}, { "test.missing": "Text." })).toBeUndefined();
});
