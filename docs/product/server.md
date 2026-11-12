# Server

The server owns lifecycle and transport. Pi owns providers, logins, models, and session format. [The product contract](README.md) and [checkpoint](../checkpoint.md) distinguish acceptance from this implementation.

## Startup and access

[CLI](../../packages/independum/src/cli.ts) and [startup](../../packages/independum/src/start-app-server.ts) listen locally at `127.0.0.1:4870`. Preview uses an isolated home and configurable port. Development and preview serve Vite middleware. Headless serves the built UI from `dist` or reports its absence. Development, preview, and QA build that UI first.

[The launcher](../../packages/independum/src/dev.ts) watches source modification times and debounces restart by 100 milliseconds. One token survives a development launch's restarts. A normal launch generates a token. The CLI removes it from the tool environment. Browser links carry it in a fragment, which the browser saves locally and removes from history. [Headless](headless.md#storage-and-api) owns account-only discovery.

Every `/api/` route requires the bearer token, including health and streams. [Access checks](../../packages/independum/src/create-server.ts) accept configured loopback and localhost hosts on the listening port. Supplied Origin must match. An absent Origin is accepted, as decision 0053 clarifies. Wrong host or Origin returns 403, and invalid authentication returns 401. Comparison uses timing-safe equal-length buffers.

## Phone listener

[Decision 0070](../decisions/0070-phone-access-with-device-pairing.md) owns the security rationale. [Settings](settings.md#phone-access) owns setup and pairing. The separate listener starts off. Direct HTTPS binds one selected private IPv4 address or IPv6 ULA with IPv6-only binding and supplied current certificates covering the exact destination. Failure leaves it off.

A private HTTPS proxy targets exact `127.0.0.1` backend host and port. Checks use the actual IPv4 peer and Host, never forwarded headers. Supplied Origin equals the configured external HTTPS origin. These checks cover the UI as well as APIs. The phone UI is the built bundle without Vite endpoints.

Invitation credentials can only claim pairing, and receipts can only collect their result. Approved phone credentials authorize ordinary application APIs and their own name or disconnection. They cannot use local phone administration, discover the local token, or stop the server. The phone listener rejects local control credentials.

Pairing bounds one invitation and pending claim with two-minute expiry. Approval binds id and comparison code and persists a hash before delivering the claimant's credential. Revocation destroys active responses and refuses future requests. Disablement closes phone sockets and pending pairing but retains saved pairings. Accepted chat work keeps its normal lifetime.

[Phone routes and checks](../../packages/independum/src/create-phone-server.ts), [pairings](../../packages/independum/src/create-phone-pairings.ts), and [types](../../packages/independum/src/api-types.ts) own exact messages. Pairing responses use no-store caching and the listener sends no-referrer policy.

## Chat lifecycle

[Chat](../../packages/independum/src/create-chat.ts) retains runs by id. Concurrent opens share a pending promise. Each request acquires and releases a handle. Each follower subscribes independently. A run captures its Pi manager, folder, profile, tools, settings, streaming state, context, and pending work. Empty chats exist in memory before Pi saves a first message.

A run stays alive for requests, followers, reply or compaction, pending notes, running commands, or deliverable waiting inputs. An idle unheld run unsubscribes and disposes. Reopening loads its Pi file. Sending refuses missing models, compaction, and invalid configuration. Acceptance precedes asynchronous completion. Settlement emits completion and releases idle runs.

Background completion wakes a retained run through a steering note. It waits for manual compaction. An absent run only gets a saved note. Archive and deletion stop owned work before changing files, as [chats](chats.md) describes. Shutdown closes phone access, stops all runs and commands, suppresses completion notes, and then closes connections.

## Storage

The normal home is `~/.independum`. Pi owns its credential stores and session files. Never inspect credential files during development. [Profiles](profiles.md#files), [headless](headless.md#storage-and-api), [attachments](attachments.md#storage-and-grants), and [hooks](hooks.md#inspection-and-reload) own their stores.

Sessions save with the first message. Archived sessions move separately. Pins are saved ids. Outputs and the last request are per chat. Waiting inputs and receipts use atomic replacement. Account-only `runtime/phones.json` retains phone ids, names, times, and credential hashes. Plaintext phone credentials remain in their browser and temporary receipt memory.

[Request persistence](../../packages/independum/src/create-saved-requests.ts) overwrites one payload and silently tolerates save failure. Capture awaits that attempt before provider continuation. Missing or invalid data reads as null. Archive moves only the session. Runtime command records, subscribers, and warming counts are not resumed after restart. This is not full request retention. CP-06 records the accepted optional archive.

## Routes and payloads

[API types](../../packages/independum/src/api-types.ts), [chat validators](../../packages/independum/src/create-chat-routes.ts), and [login routes](../../packages/independum/src/create-login-routes.ts) own exact shapes. There is no parallel prose schema here. Mutations normally return 204 unless their route returns a resource or acceptance. Validation errors normally return `{ error }`, with 400 for input, 404 for missing resources, and 409 for unavailable work. Area protocol pages own conditional save and operation-specific errors.

## Streams

[Streams](../../packages/independum/src/stream-events.ts) use fetch-based server-sent events so authorization headers are available. They have no replay cursor. Per-chat streams begin with state and shared streams with projects and replying chats. Reconnection restores streaming prefixes and tool progress. Disconnecting a client does not stop its chat. The browser retries after 1.5 seconds and treats 401 as expired authority.

## What reaches the model

[Runtime](../../packages/independum/src/create-model-runtime.ts) disables automatic Pi discovery. [Context](context.md#requests-and-pi) owns prompt projection, revisions, hooks, and compaction captures. Ordinary capture records the last final payload. Warming requests increment a count. UI metadata stays outside model input.

[Request matching](../../packages/independum/src/summarize-request.ts) estimates parts, omits unknown-only sections and short unmatched fragments, and never proves complete coverage. [History](../../packages/independum/src/list-requests.ts) reconstructs assistant entries rather than logging every provider call. CP-05 distinguishes these from exact capture. Harness logic remains in this package while the `packages/core` timing question stays parked.
