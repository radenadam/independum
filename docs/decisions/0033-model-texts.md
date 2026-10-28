# Model texts

- Status: accepted
- Date: 2026-10-28

## Context

The maintainer wants every text that the model receives to be visible and editable from the UI, each with a way back to its built-in text. That covers the system prompt, the descriptions of the tools and their parameters, and every text that a tool or a note sends under each of its conditions. The side panel gives the overview, and editing opens over the page. The texts that Pi writes stay read-only for now, but the user must be able to see each of them, and whether to edit them is a later decision. The roadmap also asked what happens to an edit when a new version of Independum changes the same built-in text.

## Decision

- A model text is a text that Independum sends to the model. Each one has an id, the group and the section it belongs to, a label that says when the model gets it, its built-in text, and its slots.
- A slot is a name in braces, such as `{id}`, where Independum puts a value when it sends the text. A name in braces that is not a slot stays as written.
- A text that differs by condition becomes one model text for each condition, so each one is edited whole. A text built from parts, such as the note where output is cut, keeps each part as a model text of its own.
- Tool names, parameter names, and parameter types stay fixed, because the code reads them. Their descriptions are model texts.
- Edits live in `~/.independum/settings.json` under `texts`, each with the built-in text that it started from. A text saved as its built-in text stops being an edit and follows the built-in text from then on.
- When a new version of Independum changes a built-in text that the user edited, the edit stays. The Agent place marks its part as "built-in changed", and the editor shows the new built-in text with a choice to use it or to keep the edit.
- The Agent place stays the overview. The system prompt, each tool, and the output limit have an edit button that opens their texts in a dialog over the page, which covers the screen of a phone.
- Each text in the dialog has its own reset. Each part of the agent has a reset too, which brings back its built-in texts and settings, such as the chosen shell and the switch of a tool. A part that differs from its built-in state carries an "edited" mark.
- The dialog shows the slots of each text with what they hold, puts a slot where the cursor stands, previews the text filled with examples, and warns when a slot is gone or when a name in braces is not a slot.
- An edit reaches the model with the next turn of every chat. Pi copies a description when a tool is registered, so Independum registers its tools through its hidden extension and registers them anew after each change. The same extension hands Pi the system prompt before each turn.

## Consequences

- Every text that a tool sends to the model is a model text from the day the tool ships, as `AGENTS.md` says.
- The server shares `fillText` with the UI through `independum/text-slots`, so the preview fills slots exactly as the server does.
- Pi sends a change in an open chat as messages of its own, such as an update to a section of the system prompt, or a notice that a tool changed. In tests, Haiku and Luna both followed an edited prompt and an edited result in the middle of a chat. Showing these texts of Pi is the next step on the roadmap.
- Only models that cannot take such an update in the middle of a chat get a new start of the request after an edit, which costs the cache of that chat once.
- A `settings.json` that starts with a byte order mark now loads, and a file that is not JSON gives the built-in settings, as decision 0031 intended.
- The pencil icon is now Edit, which also renames a chat, and a new Reset icon brings back built-in texts and settings.
