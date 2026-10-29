import { defineText, type ModelText, type ModelTexts } from "./model-texts.ts";

/**
 * The envelope around every note that Independum adds to a chat, which names its source so the
 * model can tell it from what the user wrote. It shows with the texts of Shell, whose background
 * commands send the only notes so far.
 */
export const envelopeText: ModelText = defineText({
  id: "note.envelope",
  group: "Shell",
  section: "note",
  label: "Around each note that Independum adds to the chat",
  builtIn: '<independum source="{source}">\n{note}\n</independum>',
  slots: {
    source: { meaning: "Where the note comes from.", example: "background command 3" },
    note: {
      meaning: "The note itself.",
      example:
        "Background command 3 ended with exit code 0 after 84.2 s. Its output is in ~/.independum/outputs/chat/call.log",
    },
  },
});

/** Wraps a note in the envelope that names its source. */
export function wrapNote(source: string, note: string, texts: ModelTexts): string {
  return texts.fill(envelopeText, { source, note });
}
