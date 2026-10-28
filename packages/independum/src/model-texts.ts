import type { EditedText, TextSection, TextSlot, TextSummary } from "./api-types.ts";
import { fillText } from "./text-slots.ts";

/**
 * A text that Independum sends to the model, with its built-in wording and the slots that a value
 * fills when the text is sent.
 */
export interface ModelText<Slot extends string = string> {
  id: string;
  group: string;
  section: TextSection;
  label: string;
  builtIn: string;
  slots: Record<Slot, Omit<TextSlot, "name">>;
}

/** The model texts with the edits of the user, which the tools read each time they send one. */
export interface ModelTexts {
  get(text: ModelText): string;
  fill<Slot extends string>(text: ModelText<Slot>, values: Record<Slot, string | number>): string;
}

/** Returns a model text as written, so that the names of its slots become a type. */
export function defineText<Slot extends string = never>(text: ModelText<Slot>): ModelText<Slot> {
  return text;
}

/** Creates the model texts, which read the edits of the user each time a text is sent. */
export function createModelTexts(getEdited: () => Record<string, EditedText>): ModelTexts {
  function get(text: ModelText): string {
    return getEdited()[text.id]?.text ?? text.builtIn;
  }
  return {
    get,
    fill: (text, values) => fillText(get(text), values),
  };
}

/** Returns each model text as the Agent place shows it, with the edits of the user. */
export function summarizeTexts(
  texts: ModelText[],
  edited: Record<string, EditedText>,
): TextSummary[] {
  return texts.map((text) => {
    const edit = edited[text.id];
    return {
      id: text.id,
      group: text.group,
      section: text.section,
      label: text.label,
      text: edit?.text ?? text.builtIn,
      builtIn: text.builtIn,
      isEdited: edit !== undefined,
      editedFrom: edit !== undefined && edit.builtIn !== text.builtIn ? edit.builtIn : null,
      slots: Object.entries(text.slots).map(([name, slot]) => ({ name, ...slot })),
    };
  });
}

/**
 * Returns the edits of the user after a change, or undefined when the change names a text that
 * does not exist. A text that matches its built-in text is not an edit, so it goes back to the
 * built-in text and follows it when Independum changes it.
 */
export function changeTexts(
  texts: ModelText[],
  edited: Record<string, EditedText>,
  change: Record<string, string | null>,
): Record<string, EditedText> | undefined {
  const next = new Map(Object.entries(edited));
  for (const [id, value] of Object.entries(change)) {
    const text = texts.find((each) => each.id === id);
    if (text === undefined) {
      return undefined;
    }
    if (value === null || value === text.builtIn) {
      next.delete(id);
    } else {
      next.set(id, { text: value, builtIn: text.builtIn });
    }
  }
  return Object.fromEntries(next);
}
