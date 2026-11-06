# Server

Decisions: [0002](../decisions/0002-build-on-the-pi-sdk.md), [0003](../decisions/0003-typescript-monorepo-on-node.md), [0005](../decisions/0005-phone-access-through-token-auth.md), [0010](../decisions/0010-one-server-for-the-ui-and-the-api.md), [0011](../decisions/0011-logins-run-as-sessions.md), [0012](../decisions/0012-pi-updates-arrive-as-reviewed-pull-requests.md), [0013](../decisions/0013-first-chat.md), [0026](../decisions/0026-context-place.md), [0030](../decisions/0030-commands-place.md), [0031](../decisions/0031-tool-settings.md), [0033](../decisions/0033-model-texts.md), [0034](../decisions/0034-texts-of-pi.md), [0048](../decisions/0048-session-place.md), [0051](../decisions/0051-chats-run-on-their-own.md), and [0058](../decisions/0058-address-chats-by-id.md). Pi owns the agent loop, providers, and session format.

## Startup and access

`cli.ts` uses `start-app-server.ts` to start the local control server at `127.0.0.1:4870`. Preview uses the same startup with an isolated home and a configurable port. Requests beginning with `/api/` go through Hono. Development and preview send other requests to Vite in middleware mode. [Headless startup](headless.md) starts no Vite instance and serves an installed build from the web package's `dist` folder, or reports that the build is absent. Development, preview, and QA commands build that UI first. Distribution remains packaging work. Closing the server closes phone access and waits for every chat to stop before closing local UI and HTTP connections. `dev.ts` watches server source and restarts after changed modification times, with a 100 millisecond delay. A development launch supplies one local token across those restarts. [Browser QA](../browser-qa.md) describes preview and browser scenarios.

The token comes from the development launcher or is randomly created. The CLI removes it from the environment before constructing chats and tools. A browser launch prints a link with the token in its fragment. The browser saves that token in local storage and removes the fragment from browser history. [Headless discovery](headless.md#storage-and-api) uses an account-only token file published after listening, and no headless output prints the token. Every API call, including health and event streams, requires `Authorization: Bearer <token>`.

Local access checks accept only the configured loopback and localhost hosts on the listening port. A supplied Origin must match one of their HTTP origins. An absent Origin is accepted. A wrong host or origin returns 403, and a missing or wrong token returns 401. Local token comparison uses equal-length buffers and timing-safe equality.

## Phone listener

[Decision 0070](../decisions/0070-phone-access-with-device-pairing.md) adds a separate listener through `create-phone-access.ts`, `start-phone-listener.ts`, and `create-phone-server.ts`. [Phone access in Settings](settings.md#phone-access) owns the setup and pairing flow. It starts off each launch. Direct HTTPS binds one currently assigned private IPv4 address or IPv6 ULA with IPv6-only binding. Supplied certificates must cover the exact HTTPS hostname or address and be current. An invalid certificate or failed binding leaves access off without fallback.

A user-run private HTTPS proxy targets an exact `127.0.0.1` backend port on this computer. The backend checks that exact Host and IPv4 loopback peer. It never trusts forwarded headers. A supplied Origin equals the configured external HTTPS origin exactly. These address checks cover the UI too. The phone listener serves the built UI and shared chat services, with no Vite or development reload endpoint.

Invitation credentials authorize only `POST /api/pairing/claim`. Receipts authorize only `GET /api/pairing/receipt`. Approved device credentials authorize normal application APIs and `GET`, `PUT`, and `DELETE /api/phone/self`. Phone credentials cannot use local phone administration or server lifecycle routes. The phone listener rejects the local control token. Health and event streams require authentication.

`create-phone-pairings.ts` bounds one invitation and pending claim, uses two-minute expiry, and requires exact request id and comparison code approval. Approval persists a credential hash before returning the credential to its receipt holder. Only the claimant can collect it. The receipt remains retryable until expiry or the device first authenticates. Revocation destroys that device's active responses, including event streams, and refuses later requests. Disablement closes all phone sockets and cancels pending pairing. Saved pairings remain until revoked, including across server restarts. Accepted chat work retains its ordinary lifetime.

Local controls use `GET`, `PUT`, and `DELETE /api/phone-access` for state and listener setup, `POST` and `DELETE /api/phone-access/invitation`, `POST /api/phone-access/approve` with `{ id, code }`, `PUT` and `DELETE /api/phone-access/phones/:id` for name and revocation, and `DELETE /api/phone-access/phones` to revoke all. Invitation creation returns `PhoneInvitation` with its public id, address, expiry, and locally generated SVG. Cancellation requires `{ id }` and rejects a replacement invitation. The image never has a phone-accessible route. Setup uses `PhoneConnection`, and state uses `PhoneAccessState` in `api-types.ts`. Pairing responses and the phone listener use `Cache-Control: no-store` and the listener uses `Referrer-Policy: no-referrer`. No credential enters model context or ordinary status output.

## Chat lifecycle

One `Chat` instance holds a map of retained runs. Each active chat route acquires a handle for its id and releases it when the request ends. Each event stream has its own subscription to that run. Each run has a Pi session, project folder, chosen-model flag, replying and compaction state, context version, pending note count, running tools, last request, cache warming count, thinking timing maps, and stream subscription. Each run has its own applied profile, captured tools, and request settings. One background command manager serves all runs. Concurrent opens of one saved or empty chat share a pending promise. Empty chats retain their Pi manager and profile choices in memory because Pi saves no file until the first message. A model choice keeps its starting run while it waits for Pi.

A run stays alive while a request or follower holds it, while it replies or compacts, while a note is pending, or while it owns a running background command. An idle run with none of these holds unsubscribes, disposes its Pi session, and leaves the map. Reopening it reads its session file. Sending is refused without a chosen model, during compaction, or with invalid configuration. Pending inputs retain a run until delivery or a held state. A send begins asynchronously and returns acceptance before model completion. Pi settlement emits reply completion and releases idle unopened runs. Prompt failures also emit an assistant error and completion.

Background completion delivers a custom message to a retained run with `triggerTurn: true` and steering delivery. A note waits for manual compaction to finish first and is discarded if its chat stops while it waits. If the run is absent, its unarchived saved session receives the note without starting a run. [Chats](chats.md#sidebar-and-management) describes how archiving and deletion stop a retained run before changing its file. Server shutdown waits for foreground and background commands and Pi replies in every retained run to stop, and suppresses completion notes while they stop.

## Storage

The CLI uses `~/.independum`. Pi's model runtime owns `auth.json` for logins and `models.json` for model settings there. `installation.json` holds the stable id passed to Pi for logins that need a device id. Session files belong to Pi and are not edited by Independum as plain files.

| Path under that folder | Contents and lifecycle |
| --- | --- |
| `sessions` | Pi session files, saved with the first message. Startup selects the newest in the launch folder. |
| `sessions/archived` | Archived session files, moved with their existing names. |
| `pinned-chats.json` | Array of pinned ids. Archive and deletion remove a pin. |
| Configuration files | User defaults, profiles, and chat choices, as [profiles](profiles.md#files) describes. |
| `outputs/<chatId>` | Retained cleaned Shell logs named from sanitized tool call ids. Deletion removes this folder. |
| `pending-inputs/<chatId>.json` | Versioned pending inputs and idempotency receipts, atomically replaced. Restart restores remaining inputs held. Deletion removes the file. |
| `requests/<chatId>.json` | The last captured raw provider payload. Deletion removes it. |
| Headless records | Private server discovery and durable operation references, as [headless storage](headless.md#storage-and-api) describes. |
| `runtime/phones.json` | Persistent phone ids, names, pairing and activity times, and SHA-256 credential hashes. Account-only runtime directory and file checks apply before reads and atomic writes on every system. Plaintext credentials stay in the claimant's browser and briefly in pending receipt state. |

The request save is asynchronous and overwrites the same file. Save errors are silent, and reads of missing or invalid data return null. It is best effort, not an ordered request archive. Archive moves only the session file and leaves retained output and request files in place. Background command ids, controls, ended command records, warming counts, and stream subscribers live only in memory. A restart does not resume processes. Thinking durations are custom entries in the Pi session. [Browser choices](settings.md) and [drafts](chats.md#drafts-and-export) use browser storage.

## Routes and payloads

All paths below have the `/api` prefix. Bodies and responses are JSON unless stated otherwise. A successful mutation has no response body with status 204 unless the table gives another status. Error responses from route validation use `{ error: string }`. A missing chat is 404, invalid input is 400, and sending while unavailable is 409. A malformed JSON body generally becomes an empty invalid body, but New chat permits no body. Unexpected failures use Hono's server error response.

The exact response fields and nullable values are in [api-types.ts](../../packages/independum/src/api-types.ts). The named types in this table are that contract.

| Method and path | Body | Success |
| --- | --- | --- |
| `GET /health` | None | `{ status: "ok", serverId, version, protocolVersion: 1 }` for the listening app. |
| `GET /providers` | None | `{ providers: ProviderSummary[] }`. Each has id, name, offered methods, and nullable login method and source. |
| `DELETE /providers/:providerId/login` | None | Removes the saved login through Pi. |
| `POST /logins` | `{ providerId, method }`, with method `apiKey` or `account` | 201 with `{ id }`. Unknown provider or unsupported method is 400. |
| `GET /logins/:id/events` | None | Event stream with recorded login events, then live ones. Missing id is 404. |
| `POST /logins/:id/answers` | `{ questionId, value }`, both strings | Answers a waiting question. Missing question or invalid answer is 404. |
| `DELETE /logins/:id` | None | Cancels if present. |
| `GET /models` | None | `{ models: ModelSummary[] }` from available Pi models. |
| `GET /chats/first` | None | `{ id }` for the newest saved chat in the launch folder, or an empty chat there. |
| `GET /chats/events` | None | Shared projects and reply completion stream. |
| `GET /chats/:id` | None | `ChatState` of the named active chat. |
| `GET /chats/:id/events` | None | Events of the named chat. |
| `GET /chats/:id/agent` | None | `AgentSummary`. |
| `GET /chats/:id/context` | None | `ContextSummary`. |
| `POST /chats/:id/messages` | `kind: "send"`, UUID `id`, `expectedRevision`, nullable `expectedLeafId`, `delivery` as `queue` or `steer`, exact `text`, optional `interpretation` and `previewId`, and optional `approvalMode` of `browser` or `headless`. Absence selects `headless` | Durable 202 with `inputId`, `state`, and `revision`. Invalid input is 400, stale state or conflicting identity is 409, and a persistence failure is 500. |
| `DELETE /chats/:id/pending/:inputId` | None | Removes a waiting or held input. Handoff or a delivered receipt returns 409. Missing input returns 404. |
| `POST /chats/:id/pending/resume` | None | Releases held delivery. Running or compacting work returns 409. |
| `PUT /chats/:id/model` | `{ providerId, modelId }`, both strings | Chooses an available model with configured login. Failure is 400. |
| `PUT /chats/:id/thinking` | `{ level }`, a string offered by the model | Changes thinking effort. Failure is 400. |
| `POST /chats/:id/new` | Optional `{ folder }`, a string | 201 with `{ id }`, in the source chat's folder or a known project, with its resolved profile defaults. Invalid folder is 400. |
| `POST /chats/:id/stop` | None | Holds pending inputs before aborting the named reply. |
| `POST /chats/:id/compact` | None | 202 when manual compaction starts. A chat without a model or while replying or compacting is 409. |
| `POST /chats/:id/commands/:commandId/background` | None | Moves a foreground Shell call by tool call id. Missing call in that chat is 404. |
| `POST /chats/:id/commands/:commandId/stop` | None | Stops a foreground or background command by tool call id. Missing running call in that chat is 404. |
| `GET /chats/archived` | None | `{ chats: ArchivedChatSummary[] }`, with folder and project name. |
| `GET /chats/:id/markdown` | None | Markdown text for an unarchived saved chat. |
| `PUT /chats/:id/name` | `{ name }`, a nonempty trimmed string | Saves the name. |
| `PUT /chats/:id/pinned` | `{ isPinned }`, a boolean | Changes the pin. |
| `PUT /chats/:id/archived` | `{ isArchived }`, a boolean | Archives or restores the file. |
| `DELETE /chats/:id` | None | Removes an archived or unarchived chat and retained files. |
| Configuration routes | Explicit resources and conditional saves | See [profiles](profiles.md#api) for their addresses and return codes. |
| Headless routes | Explicit submissions and operation ids | See [headless API](headless.md#storage-and-api) for prompts, waits, and shutdown. |

`ModelSummary` gives provider id and name, model id and name, API, base URL, context window, maximum output, nullable image and request byte limits, prices, price tiers, and cache durations. `AgentSummary` gives system prompt, Pi addition, added facts and knowledge cutoffs, model overrides and compaction settings, tool schemas and availability, shell choices, current and built-in limits and hand-back, model texts, Pi texts, environment values, and suggestions. Environment values are present for the authorized UI even though tool descriptions show only names.

`ContextSummary` gives chat and model ids, window size and use, reserve, token counts and cost, last reply usage, message and call counts, dates, branch entries without file fingerprints, last raw request, detected parts, reconstructed requests and pending changes, warming count, and file paths. `SettingsChange` changes the tool choices, added fact switches, model overrides, compaction, and model texts of an explicitly addressed profile. Knowledge cutoffs belong to user settings. Its `tool` field changes one named tool, and its `texts` field patches by id with a string or null for reset. [Tool settings](tools.md#shared-contract) and [text editing](settings.md#tools-and-model-texts) define validation.

[Attachment routes](attachments.md#api) also live under `/api/chats/:id`. Send accepts attachment source ids and explicit file path choices, including attachment-only input. Chat state includes effective attachment settings and delivered source previews. Waiting inputs include source references and original display metadata. [Attachment storage](attachments.md#storage-and-grants) retains originals independently of Pi's canonical prepared messages.

## Streams

Branch mutations extend `POST /api/chats/:id/messages` with `kind` of `edit` or `retry`, `sourceUserEntryId`, and a nullable `model` containing provider id, model id, and exact thinking level. Both require the input id, expected pending revision, and expected leaf. Edit requires text and retry requires `sourceAssistantEntryId` and accepts no replacement text. Null selects the current choice for edit or the recorded choice for retry. Inputs use the existing durable receipts. `GET /api/chats/:id/branches` takes `sourceUserEntryId` and a `kind` of `prompt` or `reply` and loads choices on demand. `POST /api/chats/:id/branch` takes those fields, `targetId`, `expectedRevision`, and `expectedLeafId`. Missing entries return 404, malformed choices return 400, conflicts return 409, and persistence errors return 500. State includes compact branch counts keyed by selected user entry ids, the latest selection id, and any blocking reason. Pi metadata stays outside model context. [The branch implementation](../../packages/independum/src/create-conversation-branches.ts) caches its index by tree entry count and leaf.

The input `leafId` names the latest message, context edit, compaction, summary, or saved branch selection. Model choices and other metadata do not move it. This keeps a draft valid when its composer changes model or effort while still rejecting another browser's branch selection.

Streams are server-sent events whose `data` is one JSON event, read with fetch so the token header can be sent. They carry no event id or replay cursor. Disconnecting a browser unsubscribes without stopping a chat. The UI retries dropped chat streams after 1.5 seconds and treats 401 as an expired link.

The per-chat stream begins with `state`. The shared stream at `/api/chats/events` begins with `projects` and `replyingChats`, with live events queued behind the initial list. State has id, folder, nullable model and thinking choice, messages, replying flag, streaming reply parts, foreground tool start times and latest progress, compaction state and error, context version, and running background commands. It also includes `leafId`, `pending` with its revision, paused flag, inputs and error, and the user delivery mode. A `pending` event carries chat id, leaf id, and the complete pending snapshot. Projects contain folders and saved chat summaries. Replying ids and `replyEnded` events cover every run. Detailed events cover only the named run. A `removed` event ends its stream and carries an empty replacement chat id.

Permission waiting uses tool progress and is restored by the state snapshot. [Permission routes](permissions.md#approvals-and-api) resolve the bound request. Other `ChatEvent` variants carry `message`, `replyDelta` with index, part type and text delta, `replyPart` with index and complete part, `replying` with its flag, `toolStart` with call id, `toolProgress` with id and details, `toolResult` with id and result, and `commandEnd` with completion data. `contextChanged` carries context version, compaction state, and compaction error. The shared `ChatsEvent` variant `replyEnded` has chat id and nullable last assistant message. Tool argument deltas are throttled to at most one per 80 milliseconds. Reconnecting, switching to a retained run, and changing effort restore the reply so far and running tool progress through state.

Login events are `question` with id, kind, message and optional placeholder or choices, `questionClosed` with id, `link` with URL and optional instructions, `deviceCode` with code and URL, `note` with message, `done`, and `failed` with message. The stream closes at done or failed. Finished login sessions stay addressable for five minutes so a fast flow can be followed after it finishes.

## What reaches the model

An in-memory Pi settings manager and resource loader disable discovered context files, skills, prompt templates, themes, and extensions. The append prompt is empty. Independum supplies its editable system prompt before the agent starts and activates only its enabled, available tools. The [context pipeline](context.md#requests-and-pi) supplies separately controlled base prompt, facts, project instructions, and skill metadata. Typed projection controls supported Pi additions. Pi can still add provider text, setup changes, tool errors, image notes, compaction text, and other SDK content.

The request hook observes Pi's final provider payload after typed context projection and does not replace it. Ordinary captured requests update memory and the last request file. Cache warming requests increment a separate count and do not replace that payload. Replacement compaction uses its own request callback and [separate capture](context.md#compaction). [Model settings](settings.md#model-settings-and-compaction) apply to catalog copies and request options through Pi's stream function. Notes reach Pi as custom messages with an editable source envelope. Custom timing entries stay saved without entering model messages. Tool content reaches the model, while UI diffs and fingerprints stay in result details.

`summarize-request.ts` walks request values and matches known prompts, tools, messages, and Pi texts without provider branches. It estimates tokens from text length, ignores unmatched fragments shorter than 40 characters, and drops sections with no known source. Text keys shorter than eight characters match only a whole request text. The parts view is an approximation. The raw payload is the captured request without that filtering. `list-requests.ts` reconstructs history from saved assistant messages and changes, so retries and requests without such messages have no independent row.

## Code

- [CLI](../../packages/independum/src/cli.ts), [development launcher](../../packages/independum/src/dev.ts), [access checks](../../packages/independum/src/create-server.ts), and [model runtime](../../packages/independum/src/create-model-runtime.ts).
- [Chat implementation](../../packages/independum/src/create-chat.ts), [chat routes](../../packages/independum/src/create-chat-routes.ts), [login routes](../../packages/independum/src/create-login-routes.ts), and [login session](../../packages/independum/src/start-login-session.ts).
- [Request persistence](../../packages/independum/src/create-saved-requests.ts), [request matching](../../packages/independum/src/summarize-request.ts), [history reconstruction](../../packages/independum/src/list-requests.ts), and [stream transport](../../packages/independum/src/stream-events.ts).

## Known differences from the decisions

- Decision 0010 describes requests from the server's own origin only. Access checks also accept requests without an Origin header when the host and token pass. See `packages/independum/src/create-server.ts:24`.
- Decision 0003 places harness logic in a planned `packages/core`. It remains in `packages/independum/src/create-chat.ts:170`, used directly from `packages/independum/src/cli.ts:27`.
- [Context controls](context.md#remaining-checkpoint-work) lists the remaining Pi additions that have no public omission API. These stay unavailable with their source and reason.
- Other current differences belong to [chats](chats.md#known-differences-from-the-decisions), [Session](side-panel.md#known-differences-from-the-decisions), [settings](settings.md#known-differences-from-the-decisions), and [tools](tools.md#known-differences-from-the-decisions).
