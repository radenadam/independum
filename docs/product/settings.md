# Settings

Decisions: [0008](../decisions/0008-login-and-first-launch.md), [0011](../decisions/0011-logins-run-as-sessions.md), [0017](../decisions/0017-logins-in-settings.md), [0020](../decisions/0020-managing-chats.md), [0031](../decisions/0031-tool-settings.md), [0033](../decisions/0033-model-texts.md), [0034](../decisions/0034-texts-of-pi.md), [0036](../decisions/0036-options-for-commands.md), [0037](../decisions/0037-hand-back.md), [0050](../decisions/0050-notifications.md), and [0055](../decisions/0055-model-settings-and-compaction.md). [Decision 0061](../decisions/0061-profiles-and-plain-settings.md) moves agent settings into [profiles](profiles.md). Browser choices still stay local.

## Settings dialog

Settings opens over the working screen, with Logins, Profiles, Appearance, Notifications, and Archived chats. Escape, Close, or a click outside closes it. It fills a phone screen, where the section choices wrap without horizontal scrolling. Profiles opens the same agent editors used by Session and identifies the target profile and its files.

Logins lists saved logins with Remove and Add a login. Without saved logins it opens the provider list directly. That list contains every provider Pi reports and searches provider names without case. A provider without a matching logo has no logo slot, as [decision 0060](../decisions/0060-omit-missing-provider-logos.md) sets out. Choosing a provider replaces the list with its account and API key methods when offered, with Back to providers above them. A provider without an available login method says it is configured outside Independum.

A login runs on the server and streams questions, links, device codes, and notes. Questions can be text, secret, choice, or pasted code. A question withdrawn by Pi disappears. Leaving the flow cancels an unfinished login. The user can answer, replace, or remove a login. Completed and failed states end the flow and offer Done or Try again. Pi saves keys without testing them, so success means saved, and an invalid key can fail on the first model call. The logins list and the providers list show each login's method and source.

First launch offers Get started, which opens Logins, and Just look around, which enters without a login. The browser remembers passing the welcome screen. [Server storage](server.md#storage) describes Pi's login storage and installation id.

Appearance chooses System, Light, or Dark. System follows the computer's theme, and browser local storage remembers the choice. There is no figure style selector. Notifications chooses Off or On for this browser and shows unsupported or denied permission states. [Notification behavior](chats.md#notifications) describes delivery and limits.

Archived chats shows title, project, and last modification date. Titles and details wrap on touch screens. On a computer, their tooltips stay inside Settings so they appear over the dialog. Unarchive returns a chat to its project without opening it. Delete asks for confirmation and removes its retained files. The list reloads after either operation, including failure. A failed load displays a notice.

## Tools and model texts

Session's tools detail shows each built-in tool's description, enable switch, unavailability reason, fixed parameter schema, edit action, and reset action. A disabled or unavailable tool is excluded from the active tools. Shell adds shell choice, hand-back time, and environment variables. Output limit is a separate part below the tool cards. [Tools](tools.md#shared-contract) owns the defaults, ranges, and effects of these settings.

Each registered model text has an id, group, section, condition label, built-in text, and slots. The text dialog edits a group's texts and saves them together. It shows parameter types, slot insertion at the cursor, example previews, and warnings about missing or unknown slots. Unknown brace names stay literal. Tool names, parameter names, and types are fixed. The system prompt has its own detail and editor. The note envelope is grouped with Shell, and shared file error and fingerprint texts are grouped with Read.

Edits persist with the built-in text they started from. Resetting one text or saving exactly its built-in value removes the edit. An edited built-in that changes in a later version keeps the user's value and gets a built-in changed mark. The editor offers the new built-in or Keep mine. Saving the retained value acknowledges the new built-in version.

A part's reset restores its texts and settings. Resetting Shell also enables it, selects the system default shell, restores hand-back, and clears added environment variables. Resetting Output limit restores its bounds and cut-note texts. A part says edited while its values differ from the built-in state. Choosing the system default shell stores no explicit shell choice.

[Profiles](profiles.md) owns settings persistence, strict file validation, migration, conditional saves, and live application. Runtime settings and texts belong to the selected profile. Running work keeps an immutable configuration until Pi settles, including queued continuation. Invalid files block dependent new work and preserve the last applied setup for inspection.

## Model settings and compaction

The model detail edits context window, maximum output tokens, and temperature for one provider and model in chats using the selected profile. Each number field shows its built-in value, an edited mark, and a reset. Valid edits save after a delay. Context and output values are positive safe integers. Temperature is finite and nonnegative, with none when the catalog supplies no value. Pi does not list temperature support or ranges, so the provider and thinking mode determine whether it applies. Pi can lower output to fit the remaining window.

The knowledge cutoff stays in its own editable section beside these settings, as [decision 0054](../decisions/0054-added-facts.md) describes. Its value persists under `knowledgeCutoffs`, in the user settings, outside profile settings. Resetting an override leaves the cutoff and its fact switch unchanged.

Overrides persist under `modelOverrides` in the profile settings. An override equal to the built-in value is removed. Reset removes the field or the whole model entry. Unknown models refuse a change. Catalog models stay unchanged. Retained sessions use copies with the configured limits, and each later unit of work captures the applied profile overrides. A request already in progress keeps its starting settings.

The Compaction detail in Session edits automatic compaction, room kept free, and newest tokens kept whole. Defaults come from Pi, with automatic compaction on. Both token budgets are nonnegative safe integers, including zero. Each field and the whole section can reset. These settings persist beside model overrides and apply to retained and later sessions using that profile. Pi chooses message or turn boundaries near the newest token budget. Its replacement summary texts and separate request capture live in [context controls](context.md#compaction).

Compact now uses `POST /api/chats/:id/compact` to run the replacement summarizer through Pi's manual compaction while the selected chat is idle and has a model, including when automatic compaction is off. It shows progress and Pi's error. A compacting chat refuses a message or model change and stays alive when another chat opens. Background completion notes wait until manual compaction ends before waking the chat. Settings and compaction events refresh the context data.

## Pi context

The system prompt detail shows the inventory of texts Pi can send. Each disclosure gives the text, condition, source, control availability, slots, and copy controls, and marks matches in the last captured request. [Context controls](context.md#requests-and-pi) owns supported switches and explains unavailable adapter omissions. Owned replacement compaction texts are editable and have separate request capture.

The inventory is copied into `pi-texts.ts` because Pi does not export these texts. Its test searches the installed Pi code for fixed fragments of six or more characters. This catches missing fragments but does not prove complete text equality or placement.

## Code

- [Dialog sections](../../packages/web/src/settings-dialog.tsx), [login list](../../packages/web/src/logins-section.tsx), and [login flow](../../packages/web/src/login-flow.tsx).
- [Agent details and reset actions](../../packages/web/src/agent-details.tsx), [tool cards](../../packages/web/src/tool-card.tsx), [text dialog](../../packages/web/src/text-dialog.tsx), and [text editor](../../packages/web/src/text-editor.tsx).
- [Editor validation and defaults](../../packages/independum/src/read-settings-change.ts), [model text edits](../../packages/independum/src/model-texts.ts), and [Pi inventory](../../packages/independum/src/pi-texts.ts).
- [Model overrides](../../packages/independum/src/model-settings.ts), [model detail](../../packages/web/src/model-detail.tsx), [compaction detail](../../packages/web/src/compaction-detail.tsx), and [number fields](../../packages/web/src/number-setting.tsx).

## Known differences from the decisions

- Decision 0033 says every result constituent is editable. Some connecting words, size descriptions, and ranges are fixed code. See `packages/independum/src/tools/create-edit-tool.ts:649`, `packages/independum/src/tools/version-of.ts:218`, and `packages/independum/src/tools/create-write-tool.ts:253`.
- Decision 0034 promises a check against each whole Pi text. The test checks fixed fragments anywhere in combined Pi code. See `packages/independum/src/pi-texts.test.ts:38` and `packages/independum/src/pi-texts.ts:314`.
