# Server

Decisions: [0002](../decisions/0002-build-on-the-pi-sdk.md), [0003](../decisions/0003-typescript-monorepo-on-node.md), [0005](../decisions/0005-phone-access-through-token-auth.md), [0010](../decisions/0010-one-server-for-the-ui-and-the-api.md), [0011](../decisions/0011-logins-run-as-sessions.md), [0012](../decisions/0012-pi-updates-arrive-as-reviewed-pull-requests.md), [0013](../decisions/0013-first-chat.md), [0026](../decisions/0026-context-place.md), [0030](../decisions/0030-commands-place.md), [0031](../decisions/0031-tool-settings.md), [0033](../decisions/0033-model-texts.md), [0034](../decisions/0034-texts-of-pi.md), [0048](../decisions/0048-session-place.md), and [0051](../decisions/0051-chats-run-on-their-own.md). Pi owns the agent loop, providers, and session format.

## Startup and access

`cli.ts` uses `start-app-server.ts` to start one Node HTTP server at `127.0.0.1:4870`. Preview uses the same startup with an isolated home and a configurable port. Requests beginning with `/api/` go through Hono, and other requests go to Vite in middleware mode. Closing the server waits for every chat to stop before closing Vite and HTTP connections. Built static UI serving is not implemented. `dev.ts` watches server source and restarts after changed modification times, with a 100 millisecond delay. A development launch supplies one token across those restarts. [Browser QA](../browser-qa.md) describes preview and browser scenarios.

The token comes from the development launcher or is randomly created. The CLI removes it from the environment before constructing chats and tools. It prints a link with the token in its fragment. The browser saves that token in local storage and removes the fragment from browser history. Every API call, including health and event streams, requires `Authorization: Bearer <token>`.

Access checks accept only the configured loopback and localhost hosts on the listening port. A supplied Origin must match one of their HTTP origins. An absent Origin is accepted. A wrong host or origin returns 403, and a missing or wrong token returns 401. Token comparison uses equal-length buffers and timing-safe equality. Network binding and phone pairing are absent.

## Chat lifecycle

One `Chat` instance holds a map of retained runs and one shared `current` run. Routes without a chat id always act on that open chat, across every browser. Each run has a Pi session, project folder, chosen-model flag, replying and compaction state, context version, pending note count, running tools, last request, cache warming count, thinking timing maps, and stream subscription. Shared settings and one background command manager serve all runs. Concurrent opens of one saved chat share a pending promise. A model choice keeps its starting run while it waits for Pi.

Opening another chat retains a run while it replies, compacts, has a pending note, or owns a running background command. An unopened idle run unsubscribes, disposes its Pi session, and leaves the map. Reopening it reads its session file. Sending is refused without a chosen model or while replying or compacting. A send begins asynchronously and returns acceptance before model completion. Pi settlement emits reply completion and releases idle unopened runs. Prompt failures also emit an assistant error and completion.

Background completion delivers a custom message to a retained run with `triggerTurn: true` and steering delivery. A note waits for manual compaction to finish first and is discarded if its chat stops while it waits. If the run is absent, its unarchived saved session receives the note without starting a run. [Chats](chats.md#sidebar-and-management) describes how archiving and deletion stop a retained run before changing its file. Server shutdown waits for foreground and background commands and Pi replies in every retained run to stop, and suppresses completion notes while they stop.

## Storage

The CLI uses `~/.independum`. Pi's model runtime owns `auth.json` for logins and `models.json` for model settings there. `installation.json` holds the stable id passed to Pi for logins that need a device id. Session files belong to Pi and are not edited by Independum as plain files.

| Path under that folder | Contents and lifecycle |
| --- | --- |
| `sessions` | Pi session files, saved with the first message. Startup selects the newest in the launch folder. |
| `sessions/archived` | Archived session files, moved with their existing names. |
| `pinned-chats.json` | Array of pinned ids. Archive and deletion remove a pin. |
| `settings.json` | Global tool choices, model text edits, model overrides, and compaction settings, loaded at startup and written through Pi's file mutation queue on changes. |
| `outputs/<chatId>` | Retained cleaned Shell logs named from sanitized tool call ids. Deletion removes this folder. |
| `requests/<chatId>.json` | The last captured raw provider payload. Deletion removes it. |

The request save is asynchronous and overwrites the same file. Save errors are silent, and reads of missing or invalid data return null. It is best effort, not an ordered request archive. Archive moves only the session file and leaves retained output and request files in place. Background command ids, controls, ended command records, warming counts, and stream subscribers live only in memory. A restart does not resume processes. Thinking durations are custom entries in the Pi session. [Browser choices](settings.md) and [drafts](chats.md#drafts-and-export) use browser storage.

## Routes and payloads

All paths below have the `/api` prefix. Bodies and responses are JSON unless stated otherwise. A successful mutation has no response body with status 204 unless the table gives another status. Error responses from route validation use `{ error: string }`. A missing chat is 404, invalid input is 400, and sending while unavailable is 409. A malformed JSON body generally becomes an empty invalid body, but New chat permits no body. Unexpected failures use Hono's server error response.

The exact response fields and nullable values are in [api-types.ts](../../packages/independum/src/api-types.ts). The named types in this table are that contract.

| Method and path | Body | Success |
| --- | --- | --- |
| `GET /health` | None | `{ status: "ok" }`. |
| `GET /providers` | None | `{ providers: ProviderSummary[] }`. Each has id, name, offered methods, and nullable login method and source. |
| `DELETE /providers/:providerId/login` | None | Removes the saved login through Pi. |
| `POST /logins` | `{ providerId, method }`, with method `apiKey` or `account` | 201 with `{ id }`. Unknown provider or unsupported method is 400. |
| `GET /logins/:id/events` | None | Event stream with recorded login events, then live ones. Missing id is 404. |
| `POST /logins/:id/answers` | `{ questionId, value }`, both strings | Answers a waiting question. Missing question or invalid answer is 404. |
| `DELETE /logins/:id` | None | Cancels if present. |
| `GET /models` | None | `{ models: ModelSummary[] }` from available Pi models. |
| `GET /chat/events` | None | Chat event stream. |
| `GET /chat/agent` | None | `AgentSummary`. |
| `GET /chat/context` | None | `ContextSummary`. |
| `POST /chat/messages` | `{ text }`, a nonempty string after trimming | 202 with no body. |
| `PUT /chat/model` | `{ providerId, modelId }`, both strings | Chooses an available model with configured login. Failure is 400. |
| `PUT /chat/thinking` | `{ level }`, a string offered by the model | Changes thinking effort. Failure is 400. |
| `POST /chat/open` | `{ id }`, a string | Opens an unarchived saved chat or retained run. |
| `POST /chat/new` | Optional `{ folder }`, a string | Starts in a known project. Invalid folder is 400. |
| `POST /chat/stop` | None | Aborts the open reply. |
| `POST /chat/compact` | None | 202 when manual compaction starts. A chat without a model or while replying or compacting is 409. |
| `POST /chat/commands/:id/background` | None | Moves a foreground Shell call by tool call id. Missing call is 404. |
| `POST /chat/commands/:id/stop` | None | Stops a foreground or background command by tool call id. Missing running call is 404. |
| `GET /chats/archived` | None | `{ chats: ArchivedChatSummary[] }`, with folder and project name. |
| `GET /chats/:id/markdown` | None | Markdown text for an unarchived saved chat. |
| `PUT /chats/:id/name` | `{ name }`, a nonempty trimmed string | Saves the name. |
| `PUT /chats/:id/pinned` | `{ isPinned }`, a boolean | Changes the pin. |
| `PUT /chats/:id/archived` | `{ isArchived }`, a boolean | Archives or restores the file. |
| `DELETE /chats/:id` | None | Removes an archived or unarchived chat and retained files. |
| `PUT /settings` | `SettingsChange` | Updated `AgentSummary`. Invalid recognized values or text ids are 400. |

`ModelSummary` gives provider id and name, model id and name, API, base URL, context window, maximum output, nullable image and request byte limits, prices, price tiers, and cache durations. `AgentSummary` gives system prompt, Pi addition, tool schemas and availability, shell choices, current and built-in limits and hand-back, model texts, Pi texts, environment values, and suggestions. Environment values are present for the authorized UI even though tool descriptions show only names.

`ContextSummary` gives chat and model ids, window size and use, reserve, token counts and cost, latest assistant usage, message and call counts, dates, complete branch entries, last raw request, detected parts, reconstructed requests and pending changes, warming count, and file paths. `SettingsChange` optionally replaces `shell`, `disabledTools`, `outputLimits`, `handBackSeconds`, or `environment`, and patches `texts` by id with a string or null for reset. [Tool settings](tools.md#shared-contract) and [text editing](settings.md#tools-and-model-texts) define validation.

## Streams

Streams are server-sent events whose `data` is one JSON event, read with fetch so the token header can be sent. They carry no event id or replay cursor. Disconnecting a browser unsubscribes without stopping a chat. The UI retries dropped chat streams after 1.5 seconds and treats 401 as an expired link.

Chat streams begin with `state`, `projects`, and `replyingChats`. State has id, folder, nullable model and thinking choice, messages, replying flag, streaming reply parts, foreground tool start times and latest progress, compaction state and error, context version, and running background commands. Projects contain folders and saved chat summaries. Replying ids and `replyEnded` events cover every run. Detailed events cover only the open run.

Other `ChatEvent` variants carry `message`, `replyDelta` with index, part type and text delta, `replyPart` with index and complete part, `replying` with its flag, `toolStart` with call id, `toolProgress` with id and details, `toolResult` with id and result, and `commandEnd` with completion data. `contextChanged` carries context version, compaction state, and compaction error. `replyEnded` has chat id and nullable last assistant message. Tool argument deltas are throttled to at most one per 80 milliseconds. Reconnecting, switching to a retained run, and changing effort restore the reply so far and running tool progress through state.

Login events are `question` with id, kind, message and optional placeholder or choices, `questionClosed` with id, `link` with URL and optional instructions, `deviceCode` with code and URL, `note` with message, `done`, and `failed` with message. The stream closes at done or failed. Finished login sessions stay addressable for five minutes so a fast flow can be followed after it finishes.

## What reaches the model

An in-memory Pi settings manager and resource loader disable discovered context files, skills, prompt templates, themes, and extensions. The append prompt is empty. Independum supplies its editable system prompt before the agent starts and activates only its enabled, available tools. It does not load project instruction files. Pi can still add its working folder block, provider text, setup changes, tool errors, image notes, compaction text, and other SDK content.

The request hook observes Pi's provider payload and does not replace it. Ordinary captured requests update memory and the last request file. Cache warming requests increment a separate count and do not replace that payload. Compaction requests bypass the hook. [Model settings](settings.md#model-settings-and-compaction) apply to catalog copies and request options through Pi's stream function. Notes reach Pi as custom messages with an editable source envelope. Custom timing entries stay saved without entering model messages. Tool content reaches the model, while UI diffs and fingerprints stay in result details.

`summarize-request.ts` walks request values and matches known prompts, tools, messages, and Pi texts without provider branches. It estimates tokens from text length, ignores unmatched fragments shorter than 40 characters, and drops sections with no known source. Text keys shorter than eight characters match only a whole request text. The parts view is an approximation. The raw payload is the captured request without that filtering. `list-requests.ts` reconstructs history from saved assistant messages and changes, so retries and requests without such messages have no independent row.

## Code

- [CLI](../../packages/independum/src/cli.ts), [development launcher](../../packages/independum/src/dev.ts), [access checks](../../packages/independum/src/create-server.ts), and [model runtime](../../packages/independum/src/create-model-runtime.ts).
- [Chat implementation](../../packages/independum/src/create-chat.ts), [chat routes](../../packages/independum/src/chat-routes.ts), [login routes](../../packages/independum/src/login-routes.ts), and [login session](../../packages/independum/src/login-session.ts).
- [Request persistence](../../packages/independum/src/saved-requests.ts), [request matching](../../packages/independum/src/summarize-request.ts), [history reconstruction](../../packages/independum/src/list-requests.ts), and [stream transport](../../packages/independum/src/stream-events.ts).

## Known differences from the decisions

- Decision 0010 describes requests from the server's own origin only. Access checks also accept requests without an Origin header when the host and token pass. See `packages/independum/src/create-server.ts:24`.
- Decision 0003 places harness logic in a planned `packages/core`. It remains in `packages/independum/src/create-chat.ts:170`, used directly from `packages/independum/src/cli.ts:27`.
- Decision 0002 says Pi additions become controllable or are removed. The hook keeps Pi's payload unchanged, and the Pi text inventory is read-only, as decision 0033 permits. See `packages/independum/src/create-chat.ts:614` and `packages/web/src/pi-text-list.tsx:29`.
- Other current differences belong to [chats](chats.md#known-differences-from-the-decisions), [Session](side-panel.md#known-differences-from-the-decisions), [settings](settings.md#known-differences-from-the-decisions), and [tools](tools.md#known-differences-from-the-decisions).
