import { defineText, type ModelText } from "./model-texts.ts";

export const hookFailureText: ModelText<"hook" | "category"> = defineText({
  id: "hooks.failure",
  group: "Hooks",
  section: "result",
  label: "When a hook stops an operation",
  builtIn: "Hook {hook} stopped the operation because of {category}.",
  slots: {
    hook: { meaning: "The configured hook id.", example: "guardCommand" },
    category: {
      meaning: "The controlled failure category without script diagnostics.",
      example: "execution or validation failure",
    },
  },
});
