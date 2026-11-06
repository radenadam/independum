# Chats

Decisions: [0013](../decisions/0013-first-chat.md), [0016](../decisions/0016-working-screen.md), [0020](../decisions/0020-managing-chats.md), [0050](../decisions/0050-notifications.md), [0051](../decisions/0051-chats-run-on-their-own.md), [0058](../decisions/0058-address-chats-by-id.md), and [0064](../decisions/0064-queue-and-steer.md). Each chat runs independently, and the sidebar gives access to its saved file.

## Open chat and runs

Each browser chooses its own open chat through the `chat` query parameter. Reloading or copying the URL keeps that choice. Opening a chat changes only that client's event stream. Messages, model choices, thinking effort, and stopping address the chat by id. [Server lifecycle](server.md#chat-lifecycle) describes the run map and release conditions.

A client without a chat id asks for the newest saved chat in the launch folder, or an empty one there. Unknown or archived ids fall back to that first chat. New chat uses the current folder and its resolved profile defaults. It does not copy the source chat model or effort. [Profiles](profiles.md) describes saved choices and precedence. An empty chat lets the user choose among known projects. An arbitrary folder cannot be added through the UI. The launch folder is always a project, even without saved chats. Other projects come from the folders of saved chats, ordered by their newest chat.

A new chat enters the sidebar after Pi saves its first message. Its title is its saved name or its first message. A saved chat whose model no longer has a login waits for a new model choice. Opening another chat leaves replies and background commands running. Opening a chat during its reply restores its saved messages and the streaming parts so far, then follows new events. Stop holds pending delivery before aborting the reply of the open chat. Queueing and steering do not change another chat. Restart and reply failure leave remaining inputs held until Resume. Accepted work in an otherwise empty chat remains discoverable before Pi creates its saved file.

## Sidebar and management

Pinned chats come first, then the five newest unpinned chats, then projects with all their chats. The first two lists sort by last modification. Projects unfold on a click. The current project starts unfolded. Search matches chat titles without case, unfolds matching projects, and hides the pinned and recent sections. It does not search message bodies.

Every replying chat has a waving title. Long titles fade and show their full text in a tooltip. The dots and a right click open Rename, Pin or Unpin, Export as Markdown, Archive, and Delete. Rename saves on Enter or blur, cancels on Escape, and refuses an empty name. Delete asks for confirmation.

Archive removes the pin and moves the session file out of the sidebar. Unarchive in [settings](settings.md#settings-dialog) returns it to its project. Deleting removes the session file, pin, retained output folder, last request file, and pending inputs and receipts. Archive holds pending delivery, and unarchive leaves it held. Archiving or deleting a followed chat sends its followers an empty replacement id in the same folder with that folder's profile defaults. Other clients keep their chats. The operation waits for its reply and background commands to stop before disposing its Pi session and changing the saved file. Commands of other chats keep running. Completion adds no note and starts no turn while the chat closes.

## Drafts and export

Drafts use browser local storage, keyed by chat id as `independum.draft.<id>`. Switching chats swaps the draft. Durable acceptance removes submitted text only if no newer draft replaces it. A failed send preserves the exact submitted text or any newer draft. Drafts do not travel through the server and do not synchronize live between browsers. A null chat id has no saved draft.

Export downloads Markdown for an unarchived saved chat. It uses the messages in Pi's built context, so compacted messages may be absent. The title is the first heading, user text is under You, and assistant text is under Agent with its model id. Errors follow the text in italics. It omits thoughts, tool calls, tool results, notes, and turns without text or an error. It is not a full session backup.

## Notifications

Notifications are off until enabled for this browser with browser permission. Each connected UI receives reply completion events for every chat. It notifies when the chat is not open, or when the open chat is hidden or the document lacks focus. A visible focused open chat does not notify.

The notification uses the chat title and the first line of the last assistant message, shortened to at most 140 characters, or the failure text. A message without text says the reply is done. The chat id is the notification tag, so a newer notice replaces the older one. Clicking focuses the window and opens the chat in that browser. There is no service worker, so browsers that require one cannot show notices. Events are not retained for a disconnected browser.

## Code

- [Server chat state and operations](../../packages/independum/src/create-chat.ts) and [saved chat operations](../../packages/independum/src/create-saved-chats.ts).
- [Sidebar lists](../../packages/web/src/sidebar-chats.tsx), [row actions](../../packages/web/src/chat-row.tsx), and [working screen](../../packages/web/src/working-screen.tsx).
- [Draft storage](../../packages/web/src/chat-draft.ts), [notification choice](../../packages/web/src/notification-choice.ts), and [reply notices](../../packages/web/src/use-reply-notice.ts).

## Known differences from the decisions

- None identified beyond the amendments linked above.
