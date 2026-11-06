# Headless mode

- Status: accepted, with remaining checkpoint work in `docs/roadmap.md`
- Date: 2026-11-06

## Context

Scripts and other agents need to drive the same server, profiles, tools, permissions, and Pi sessions as the browser. Pi offers print and RPC modes, but wrapping another Pi process would create another runtime and persistence owner. A driver needs a small final result and an exact completion boundary.

The maintainer accepts the command shape with `prompt`, `wait`, and a lasting `control` client. The maintainer selects an account-only token file instead of the proposal's socket handoff. The first change can ship `prompt` and `wait` while the roadmap keeps the rest explicit.

## Decision

- Headless commands address the running server without opening a browser or drawing a terminal interface. They add no instructions to model context and never change a browser's selected chat.
- `prompt` creates a saved chat in a known project or addresses an exact chat id. A new chat can select an exact user or project profile. The normal resolver, command expansion, permission service, and Pi prompt API own submission.
- The default output contains only the last assistant text. JSON lines remain final-only and contain one correlated result. A no-wait prompt returns its chat and operation references. Unknown flags and output fields fail before connecting.
- An operation covers automatic work through Pi's `agent_settled` boundary, including retries and automatic continuation. An ended turn or text part does not settle it. Background commands do not hold a settled wait open.
- The server installs an observer before submission and arms it only when that submission starts. Admission reserves the chat across its asynchronous configuration save. Unrelated chats can run concurrently.
- Acceptance and settlement enter a versioned, flushed operation journal before acknowledgment. The journal stores ids, hashes, lifecycle state, and final entry references. Pi remains the owner of prompt and assistant content. Reusing a request id with different input fails. A restart marks unfinished work interrupted and never resubmits it.
- Command line source and submission ids are custom Pi entries. The chat detail shows their operation ids in a Source section. These entries never become model messages.
- `runtime/server.json` under the Independum home holds the server identity, process id, loopback origin, and access token. It is published atomically after listening. Unix requires current ownership, a directory with mode `0700`, and a file with mode `0600`. Windows creates a protected account-only directory DACL, verifies ownership and grants, and permits the token file to inherit only that account's access. Links and multiply linked files refuse discovery.
- The token file is the explicit exception to the memory-only storage of decision 0005. Tokens still rotate on launch. No headless output, command argument, or child environment contains the token. Every HTTP call keeps bearer, host, and supplied-origin checks. Clients never follow redirects with authorization.
- Automatic startup uses port `4870`, one cooperative startup lock, and a detached server with no idle timeout. An occupied port is an error. Authentication and protocol failures never start replacements. An explicit server requires an explicit token and never falls back to discovery.
- A headless server starts no Vite instance. It serves an installed UI build or reports that the build is absent, while its API remains available. Development and preview retain Vite. Packaging remains separate work.
- Default permission delivery returns an unmet approval immediately and the client reports code `7` with the operation and tool call. It grants nothing and leaves agent work running. `--on-question wait` explicitly uses browser approval delivery and waits silently for a decision and settlement. Questions can also be observed by a later default wait without cancelling their operation.
- A client deadline or disconnection detaches observation. Stopping work is explicit. Server shutdown refuses active work without force and removes only its own token record.
- The first stage contains `prompt`, `wait`, and server lifecycle commands. Unsupported controls fail explicitly. The remaining protocol and controls stay on the roadmap.

## Consequences

- This extends decisions 0001, 0005, 0010, 0058, and 0063. The browser keeps the existing configuration editors and approval UI.
- Pi provides prompt execution, settlement, entry reads, and non-model metadata. Independum supplies discovery, secure file publication, the operation journal, transport, and process exit reporting because Pi does not own the harness server.
- Empty chat ids remain provisional until Pi saves a message. A recorded acceptance across a crash can have an indeterminate effect. Deduplication never promises universal exactly-once execution.
- A crashed server can leave a private token record. A verified connection refusal permits its removal. An unrelated process is never killed from a stored process id.
- A complete checkpoint still needs the persistent control client, bounded history, event replay, the configuration registry, and the other controls listed in the roadmap.
