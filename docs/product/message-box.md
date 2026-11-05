# Message box

Decisions: [0013](../decisions/0013-first-chat.md), [0016](../decisions/0016-working-screen.md), [0030](../decisions/0030-commands-place.md), [0046](../decisions/0046-thinking-effort-in-the-model-menu.md), and [0052](../decisions/0052-window-figure.md). The message box keeps composition, model choice, and context use together.

## Composition

The field stays editable during a reply, but sending requires nonempty trimmed text, a chosen model, and an idle agent. There is no queue or steering control. Sending clears the [draft](chats.md#drafts-and-export) and restores its exact text if the API call fails. Without a model, Send toggles the model menu.

Enter sends when `hasKeyboard` detects hover support. Shift+Enter and Enter on a touch device insert a line break. An active composition event does not send. Escape in the field stops a running reply. The Send icon becomes Stop while the agent replies. A newly opened chat focuses the field when a keyboard is likely.

An empty chat shows the message box near the middle of the screen. Once it has messages, the box sits below them. The folder under it is selectable only while the chat is empty. Choosing a folder starts an empty chat in that project. The same row shows the count of running Shell calls and background commands, and opens Commands.

## Slash commands

[Context controls](context.md#commands) defines command choices, editable previews, built-in actions, source capture, and literal slash input.

## Model menu

The button shows the provider logo, model name, and current thinking effort when supported. The menu opens below an empty chat's box and above a populated one, and keeps that position while it is open even when the effort label changes width. Opening it reloads the available models from Pi. Only providers with a login contribute models.

Search matches model name, model id, and provider name without case. Models group under sticky provider headings. The list has room for three model rows before scrolling. Loading, no matching models, and no available models have separate states. Only the last state offers Add a login, which opens settings. Choosing a model keeps the menu open.

Thinking effort sits below the list when Pi says the selected model supports it. Pi supplies both the allowed levels and the current level. Each stop is one level. Dragging changes a held preview in the menu, and the native range change commits the level. The button keeps the server's current level until that choice reaches the server. A failed choice reverts the preview and shows a notice. A model without thinking support shows no effort control. The controls remain available while a reply runs.

## Context meter

The ring shows Pi's estimate of used context against the model's context window. Its tooltip gives the share and token counts, or says the count is not known. Clicking opens Session. It can count the last assistant output too, so it may exceed the last request shown in the [Session figure](side-panel.md#session-figure).

The meter and Session share one fetched context summary. It refreshes when the chat id, provider or model id, replying state, or context version changes. Settings and compaction events change that version. It does not refresh on every model turn or effort change. The window includes the [model override](settings.md#model-settings-and-compaction). A refresh clears old data while it loads, and a failure appears in Session. A response from a chat that is no longer open cannot replace the current data.

## Code

- [Message box](../../packages/web/src/message-box.tsx), [keyboard detection](../../packages/web/src/has-keyboard.ts), and [folder choices](../../packages/web/src/folder-menu.tsx).
- [Model menu](../../packages/web/src/model-menu.tsx), [menu layout](../../packages/web/src/model-menu.module.css), and [effort slider](../../packages/web/src/effort-slider.tsx).
- [Context meter](../../packages/web/src/context-meter.tsx), [usage formatting](../../packages/web/src/describe-usage.ts), and [refresh dependencies](../../packages/web/src/use-chat-data.ts).

## Known differences from the decisions

- Decision 0046 says the knob moves freely during a drag. The range uses `step={1}`, and its preview and position take a named level on every change. See `packages/web/src/effort-slider.tsx:85` and `packages/web/src/effort-slider.tsx:89`.
