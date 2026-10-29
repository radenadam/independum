import type { EnvironmentSuggestion } from "../api-types.ts";

/**
 * Variables that the user can add to the environment of commands, each with what it changes. A
 * command gets none of them unless the user adds it.
 */
export const environmentSuggestions: EnvironmentSuggestion[] = [
  {
    name: "GIT_EDITOR",
    value: "true",
    reason:
      "Git does not open an editor, so git commit without -m stops with an error instead of waiting.",
  },
  {
    name: "GIT_SEQUENCE_EDITOR",
    value: "true",
    reason: "git rebase -i uses its plan as it is instead of opening an editor.",
  },
  {
    name: "GIT_TERMINAL_PROMPT",
    value: "0",
    reason: "Git does not ask for a user name or a password in the terminal.",
  },
  {
    name: "GCM_INTERACTIVE",
    value: "never",
    reason:
      "Git Credential Manager does not open a sign-in window, so a push without a saved login fails instead.",
  },
  {
    name: "GH_PROMPT_DISABLED",
    value: "1",
    reason: "The GitHub CLI does not ask questions.",
  },
  {
    name: "PAGER",
    value: "cat",
    reason: "Programs print all their output instead of showing it page by page.",
  },
  {
    name: "PYTHONUNBUFFERED",
    value: "1",
    reason: "Python prints at once, so the output of a server reaches its step while it runs.",
  },
  {
    name: "PYTHONUTF8",
    value: "1",
    reason: "Python reads and writes UTF-8 on Windows too.",
  },
];
