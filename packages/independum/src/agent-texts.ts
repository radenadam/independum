import { addedFactTexts } from "./added-facts.ts";
import { attachmentTextList } from "./attachment-texts.ts";
import { contextTexts } from "./context-texts.ts";
import { hookFailureText } from "./hook-texts.ts";
import { defineText, type ModelText } from "./model-texts.ts";
import { permissionTextList } from "./permission-texts.ts";
import { compactionTexts } from "./summarize-context.ts";
import { backgroundTextList } from "./tools/create-background-commands.ts";
import { checkCommandTextList } from "./tools/create-check-command-tool.ts";
import { editTextList } from "./tools/create-edit-tool.ts";
import { outputTextList } from "./tools/create-output-log.ts";
import { readTextList } from "./tools/create-read-tool.ts";
import { shellTextList } from "./tools/create-shell-tool.ts";
import { stopCommandTextList } from "./tools/create-stop-command-tool.ts";
import { writeTextList } from "./tools/create-write-tool.ts";
import { fileTextList } from "./tools/text-file.ts";
import { fingerprintTextList } from "./tools/version-of.ts";
import { toolArgumentTextList } from "./validate-tool-arguments.ts";
import { envelopeText } from "./wrap-note.ts";

// The harness identity and folder belong to added facts, so their switches control every copy.
export const systemPromptText: ModelText = defineText({
  id: "systemPrompt",
  group: "System prompt",
  section: "prompt",
  label: "Every request",
  builtIn: "You are an agent working on the computer of the user.",
  slots: {},
});
// Every model text. The Session place groups them, and keeps this order within each group.
export const allTexts: ModelText[] = [
  systemPromptText,
  hookFailureText,
  ...contextTexts,
  ...compactionTexts,
  ...addedFactTexts,
  ...attachmentTextList,
  ...readTextList,
  ...fingerprintTextList,
  ...fileTextList,
  ...writeTextList,
  ...editTextList,
  ...shellTextList,
  ...backgroundTextList,
  ...checkCommandTextList,
  ...stopCommandTextList,
  ...outputTextList,
  envelopeText,
  ...permissionTextList,
  ...toolArgumentTextList,
];
