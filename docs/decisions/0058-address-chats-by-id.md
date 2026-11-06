# Address chats by id

- Status: accepted, with [decision 0061](0061-profiles-and-plain-settings.md) covering new chat defaults, with pending inputs added in [0064](0064-queue-and-steer.md)
- Date: 2026-11-05

## Context

Decision 0051 gives every chat its own run, but the API still drives one open chat for the whole server. Opening a chat in a second browser changes which chat the first browser follows and where its next message goes. Browsers, phones, and scripts need to choose their chats independently.

## Decision

- Each client chooses its own open chat. The browser keeps its id in the `chat` query parameter, so a reload and a copied link keep that choice. Opening a chat switches only that client's event stream.
- `GET /api/chats/first` returns an `id` for a client with no choice. It names the newest saved chat of the folder Independum starts in, or an empty chat there when none exists. It never changes another client's choice.
- `GET /api/chats/:id` returns the chat state. The chat's messages, model, thinking effort, stop, compaction, context, and agent use `POST /api/chats/:id/messages`, `PUT /api/chats/:id/model`, `PUT /api/chats/:id/thinking`, `POST /api/chats/:id/stop`, `POST /api/chats/:id/compact`, `GET /api/chats/:id/context`, and `GET /api/chats/:id/agent`.
- Commands use `POST /api/chats/:id/commands/:commandId/stop` and `POST /api/chats/:id/commands/:commandId/background`. Both ids must name the same chat and command, even when two chats have the same tool call id.
- `POST /api/chats/:id/new` returns the new `id` with status 201. It starts empty with the source chat's model, in its folder or the project named by `folder`. It changes no client's choice until that client opens the returned id.
- `GET /api/chats/:id/events` sends only that chat's state and events. It starts with the state, including the reply so far and running tool progress, then new events. Every follower holds the same run of that chat, and closing one follower never closes another.
- `GET /api/chats/events` sends the projects, the ids of chats that reply, and every reply ending with its chat id and reply. It reaches clients whatever chat they show. Events that arrive while the initial list loads wait behind it, so a reply ending cannot fall between the list and the subscription.
- A run stays alive while a request or a follower holds it, while it replies or compacts, while a completion note is pending, or while it has a background command. When none holds, Pi disposes the session. Saved chats reopen through Pi's session manager. Empty chats keep their manager, model, and thinking effort in memory because Pi saves no file before the first message and restores setup choices only for chats with messages.
- Archiving or deleting stops the chat and its background commands first. Its followers receive a `removed` event with an empty replacement chat's `replacementId`, in the same folder with the same model. Other clients keep their own chats.
- Unknown or archived chat ids return 404 from the active chat routes. The routes that act on a server-wide chat are removed without aliases. `PUT /api/settings` still changes settings for every chat and returns status 204. A client then reads the agent of its own chat.
- Every route stays behind the access token, host, and origin checks of decision 0005. The notifications and independent replies of decisions 0050 and 0051 keep their behavior.

## Consequences

- A message names its destination even when another client opens a different chat or no client follows its destination.
- Pi still owns the sessions, model choices, replies, and files. Independum adds only the client subscriptions, their lifetime, and the API addresses.
- Empty chat ids last for the server's run. After a restart, a stale id falls back to the first chat through the browser's missing chat handler.
- The glossary names Follower. The working screen keeps its existing controls and appearance.
