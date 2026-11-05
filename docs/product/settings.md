# Settings

Decisions: [0008](../decisions/0008-login-and-first-launch.md), [0011](../decisions/0011-logins-run-as-sessions.md), [0017](../decisions/0017-logins-in-settings.md), [0020](../decisions/0020-managing-chats.md), [0031](../decisions/0031-tool-settings.md), [0033](../decisions/0033-model-texts.md), [0034](../decisions/0034-texts-of-pi.md), [0036](../decisions/0036-options-for-commands.md), [0037](../decisions/0037-hand-back.md), and [0050](../decisions/0050-notifications.md). Browser choices stay local, and agent settings apply to every chat.

## Settings dialog

Settings opens over the working screen, with Logins, Appearance, Notifications, and Archived chats. Escape, Close, or a click outside closes it. It fills a phone screen. Tool settings and model texts live in Session details instead of this dialog.

Logins lists saved logins with Remove and Add a login. Without saved logins it opens the provider list directly. That list contains every provider Pi reports and searches provider names without case. Choosing a provider replaces the list with its account and API key methods when offered, with Back to providers above them. A provider without an available login method says it is configured outside Independum.

A login runs on the server and streams questions, links, device codes, and notes. Questions can be text, secret, choice, or pasted code. A question withdrawn by Pi disappears. Leaving the flow cancels an unfinished login. The user can answer, replace, or remove a login. Completed and failed states end the flow and offer Done or Try again. Pi saves keys without testing them, so success means saved, and an invalid key can fail on the first model call. The API exposes a login's source, but the UI shows the method and connected state.

First launch offers Get started, which opens Logins, and Just look around, which enters without a login. The browser remembers passing the welcome screen. [Server storage](server.md#storage) describes Pi's login storage and installation id.

Appearance chooses System, Light, or Dark. System follows the computer's theme, and browser local storage remembers the choice. There is no figure style selector. Notifications chooses Off or On for this browser and shows unsupported or denied permission states. [Notification behavior](chats.md#notifications) describes delivery and limits.

Archived chats shows title, project, and last modification date. Unarchive returns a chat to its project without opening it. Delete asks for confirmation and removes its retained files. The list reloads after either operation, including failure. A failed load displays a notice.

## Tools and model texts

Session's tools detail shows each built-in tool's description, enable switch, unavailability reason, fixed parameter schema, edit action, and reset action. A disabled or unavailable tool is excluded from the active tools. Shell adds shell choice, hand-back time, and environment variables. Output limit is a separate part below the tool cards. [Tools](tools.md#shared-contract) owns the defaults, ranges, and effects of these settings.

Each registered model text has an id, group, section, condition label, built-in text, and slots. The text dialog edits a group's texts and saves them together. It shows parameter types, slot insertion at the cursor, example previews, and warnings about missing or unknown slots. Unknown brace names stay literal. Tool names, parameter names, and types are fixed. The system prompt has its own detail and editor. The note envelope is grouped with Shell, and shared file error and fingerprint texts are grouped with Read.

Edits persist with the built-in text they started from. Resetting one text or saving exactly its built-in value removes the edit. An edited built-in that changes in a later version keeps the user's value and gets a built-in changed mark. The editor offers the new built-in or Keep mine. Saving the retained value acknowledges the new built-in version.

A part's reset restores its texts and settings. Resetting Shell also enables it, selects the system default shell, restores hand-back, and clears added environment variables. Resetting Output limit restores its bounds and cut-note texts. A part says edited while its values differ from the built-in state. Choosing the system default shell stores no explicit shell choice.

Settings persist through `create-settings.ts`. Missing or invalid JSON uses defaults. A file with a byte order mark loads. Invalid individual values loaded from a file fall back, while an API change with an invalid recognized value is refused whole. Unknown setting keys are ignored. Unknown model text ids refuse a change. Changing settings registers tools anew for every retained run and updates active tools. The custom system prompt is supplied before the next agent start. Running tools can already hold a copy of their starting limits or environment.

## Texts of Pi

The Added to the system prompt detail shows Pi's current prompt addition and the inventory of texts Pi can send for enabled features. The inventory is read-only. Each disclosure gives the text, condition, slots, and copy controls, and marks matches in the last captured request. Features Independum disables, such as skills and branch summaries, have no inventory entries. Compaction prompt entries explain that their requests are not captured.

The inventory is copied into `pi-texts.ts` because Pi does not export these texts. Its test searches the installed Pi code for fixed fragments of six or more characters. This catches missing fragments but does not prove complete text equality or placement.

## Code

- [Dialog sections](../../packages/web/src/settings-dialog.tsx), [login list](../../packages/web/src/logins-section.tsx), and [login flow](../../packages/web/src/login-flow.tsx).
- [Agent details and reset actions](../../packages/web/src/agent-details.tsx), [tool cards](../../packages/web/src/tool-card.tsx), [text dialog](../../packages/web/src/text-dialog.tsx), and [text editor](../../packages/web/src/text-editor.tsx).
- [Settings validation and defaults](../../packages/independum/src/create-settings.ts), [model text edits](../../packages/independum/src/model-texts.ts), and [Pi inventory](../../packages/independum/src/pi-texts.ts).

## Known differences from the decisions

- Decision 0011 says the provider list shows login provenance. The API returns `source`, but the UI does not display it. See `packages/independum/src/login-routes.ts:37` and `packages/web/src/logins-section.tsx:91`.
- Decision 0033 says every result constituent is editable. Some connecting words, size descriptions, and ranges are fixed code. See `packages/independum/src/tools/create-edit-tool.ts:649`, `packages/independum/src/tools/file-fingerprint.ts:218`, and `packages/independum/src/tools/create-write-tool.ts:253`.
- Decision 0034 promises a check against each whole Pi text. The test checks fixed fragments anywhere in combined Pi code. See `packages/independum/src/pi-texts.test.ts:38` and `packages/independum/src/pi-texts.ts:314`.
