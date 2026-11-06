# Headless mode

Decision: [0066](../decisions/0066-headless-mode.md). Headless commands use the same local server and Pi chats as the browser. They open no browser and accept no terminal answers. This first stage implements prompts, waiting, and server lifecycle. The remaining checkpoint work is in [the roadmap](../roadmap.md).

[Phone access](server.md#phone-listener) uses a separate listener and separate persistent credentials under decision 0070. A phone credential cannot discover the private local server token, stop the server, or administer pairing. The explicit interactive `phone pair` command can show a short-lived invitation. Headless phone configuration controls remain checkpoint work. Ordinary command output never includes a pairing invitation or phone credential.

## Commands

The source entry point is `node packages/independum/src/cli.ts`. The installed command name is `independum` when packaging ships. Running without a subcommand keeps the development browser link behavior.

```text
independum prompt "Summarize the tests." --project .
independum prompt "Continue." --chat CHAT_ID
independum prompt --text-file task.txt --profile project:research --no-wait
independum wait OPERATION_ID
independum server start
independum server status
independum server stop --force
independum phone pair
```

| Command | Behavior |
| --- | --- |
| `prompt [TEXT]` | Create a chat in the invoking folder's known project. Never resume implicitly. |
| `prompt [TEXT] --project PATH` | Create a chat in that exact known project. Resolve relative paths against the invoking folder. |
| `prompt [TEXT] --chat ID` | Send to that exact active chat. Queue during a reply. Refuse compaction or a chat without a model. |
| `wait OPERATION_ID` | Wait silently through settlement or return the already saved result. |
| `server start` | Discover or start the lasting server and print its id. |
| `server start --foreground` | Start without a browser and keep the server in this process. Accept no other flags. |
| `server status` | Read authenticated identity, version, protocol, and origin. Never start a server. |
| `server stop [--force]` | Stop an idle server. Active replies, compaction, pending submissions, and background commands require force. Never start a server. |
| `phone pair` | Require an interactive local terminal and enabled phone access. Show a one-use QR code and address, wait for a phone request, and approve only after the user types its matching code. Never start a server. |

Only known projects are accepted, as in the browser. An empty chat id remains provisional until durable input acceptance or Pi saves its first message. A new chat uses its resolved profile model and effort. Existing chat prompts keep that chat's profile and overrides.

`phone pair` uses the local control credential and the same two-minute invitation and approval service as Settings. Its ANSI character QR code has a white quiet zone and black modules regardless of terminal colors. Widen the terminal if its rows wrap. The command accepts only text output, with no field selection or token from stdin. Redirected input or output fails before creating an invitation. An unmatched code cancels pairing, and interruption attempts cancellation with a separate bounded request. Cancellation carries the invitation id so another client's replacement stays valid. The terminal never claims an invitation or receives a phone receipt or credential.

## Flags

| Flag | Behavior |
| --- | --- |
| `--format text` | Default. Final assistant text only, without progress, startup links, or catalogs. |
| `--format jsonl` | One compact versioned result or error per command, with the request id. |
| `--request-id ID` | Correlate output and deduplicate a prompt. The default is a new UUID. Reusing it with different prompt arguments conflicts. |
| `--fields NAME,...` | Select known response data fields. Unknown fields fail. Error status and codes remain visible. Plain final text prints the selected text field. |
| `--server URL` | Use an explicit loopback HTTP origin with an explicit token. Never discover or start a replacement. |
| `--access-token-stdin` | Read the explicit server token through EOF. It cannot share stdin with prompt text. |
| `--start auto` | Default. Discover the local instance or start one at port `4870`. |
| `--start never` | Refuse to start an absent server. Status and stop always use this behavior. |
| `--timeout-ms N` | Client deadline for the whole command. Default `0` waits without a deadline. Expiry leaves server work running. |
| `--help` | Print command help without connecting or starting a server. |
| `--version` | Print the application version without connecting. |

Prompt flags are `--profile ID`, `--profile user:ID`, `--profile project:ID`, `--text-file PATH`, `--text-file -`, `--literal`, `--no-wait`, and `--on-question fail` or `--on-question wait`. Wait also accepts `--on-question`. A profile selects only a new chat. Exactly one positional or file text source is required. Accepted text retains its whitespace. Stdin is read through EOF. No file reference syntax is inferred.

Normal prompt commands and skills use the shared captured expansion once. Literal input bypasses it. Executable slash actions require the later headless command service and currently fail with code `2`. Headless prompts carry no attachments in this checkpoint. The first stage does not accept attachment, delivery mode, streaming, or configuration transfer flags.

Successful plain final output contains only the last assistant message's text blocks and a final newline when needed. Thinking and tool results stay in the chat. A no-wait prompt prints two lines, `chat CHAT_ID` and `operation OPERATION_ID`. JSON final output defaults to `chatId`, `operationId`, and `text`. Selected fields can also read submission, state, final entry, question, and tool call references. There is no initial transcript or catalog.

An explicit connection can read `INDEPENDUM_ACCESS_TOKEN` instead of stdin. The CLI removes it before creating a server or tools. The local token file path is never passed in a command environment. Neither status nor error output prints the token. Requests omit Origin and retain the existing bearer and host checks. A supplied Origin still must match.

## Work and permissions

An operation starts with one accepted submission and ends at Pi settlement, after automatic continuation. Prompts use the shared [waiting message service](message-box.md#waiting-messages) with queue delivery. The observer arms at handoff, so an earlier reply cannot settle a waiting prompt. Stop holds waiting prompts until explicit Resume, and a later prompt leaves them held. Removing a waiting prompt cancels its operation. Restart holds undelivered prompts and marks their unfinished operations interrupted without resubmitting them. Waiting does not inspect a whole chat or poll its history. Each HTTP wait holds for at most 55 seconds. The client silently reconnects while its own deadline permits. A background command can continue after settlement. A later background wakeup currently has no headless operation handle.

Default prompts use the [headless permission contract](permissions.md#approvals-and-api). Project commands, file tools, and hooks read everywhere except denied paths and write inside the project. Independum's state folder stays denied, and startup needs no approval, as [decision 0067](../decisions/0067-read-everywhere-and-write-inside-the-project.md) defines. An unmet approval never executes the tool and returns `approvalRequired`. The client detaches with code `7` and operation and tool call references. The model can continue with that error result. This mode creates no pending permission question. Enabled context resources that lack read authority also report code `7` and identify the resource.

`--on-question wait` opts the prompt into the existing browser approval workflow. It waits silently while the browser or approval API answers. It never grants permission or reads a terminal answer. A later default wait can return code `7` and the pending question id while that operation stays open. Answered questions stop being reported as pending.

Ctrl+C detaches the client with code `130`. A broken output pipe also leaves server work running. Stopping the chat through its existing API or browser cancels its reply. An automatically started server remains running until stopped, with no idle timeout.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Command succeeds or the operation completes. |
| `1` | Agent or server operation fails. |
| `2` | Invalid command, input, flag, output field, or unsupported control. |
| `3` | The requested chat, project, operation, or retained output is absent. |
| `4` | Authentication or private token file authorization fails. |
| `5` | Connection, startup, protocol, restart, or indeterminate execution failure. |
| `6` | Busy chat or conflicting request id. |
| `7` | An answer or permission decision is required. |
| `8` | Client deadline expires while server work can continue. |
| `9` | Operation is cancelled. |
| `10` | The model reaches its output limit. |
| `130` | Client is interrupted. |

Plain failed output goes to stderr with its operation reference and contains no partial answer. JSON failures include the stable code and references. Assistant partial content stays in the Pi entry and browser. The first stage has no separate partial output command.

## Storage and API

`~/.independum/runtime/server.json` is the private token record. Its exact fields and protection are defined in [decision 0066](../decisions/0066-headless-mode.md). The server removes only its own record on orderly shutdown. A startup lock serializes automatic launches. A crashed lock is removed only when its recorded writer no longer exists. An occupied port, invalid private record, authentication error, or protocol mismatch never causes an unrelated listener to be replaced.

Windows permission errors identify rejected entries by SID and resolved account name, allow or deny type, numeric access mask, and inheritance. SID comparisons expand Windows abbreviations before checking the current account. Native failures name the Win32 call and its error code. Discovery and startup retain these details without reading token contents into an error.

`~/.independum/operations.jsonl` records accepted and settled operations with version `1`. Records contain lifecycle facts, request argument hashes, chat and submission references, and the final Pi entry id. Every acknowledged append is flushed. Unfinished records become interrupted on restart, and a partial trailing journal record is discarded before another append. No prompt is resubmitted. Output is read from the referenced Pi entry, including after later chat activity or restart. Deleting or archiving the chat can make that output unavailable.

| Method and path | Contract |
| --- | --- |
| `GET /api/health` | Authenticated server id, application version, protocol version `1`, and status. |
| `POST /api/prompt` | Exact `requestId`, `text`, optional `chatId` or `project` and `profile`, optional `isLiteral`, and optional `onQuestion`. Return `OperationView` with status 202. Validate all fields before submission. |
| `GET /api/operations/:id` | Compact current or terminal `OperationView`, with final text when retained. |
| `GET /api/operations/:id/wait?onQuestion=fail` | Blocking observation with the same compact result. `onQuestion=wait` stays attached to unanswered questions. |
| `POST /api/server/stop` | Explicit boolean `force`. Return 204 or 409 for active work without force. |

The chat detail's Source section identifies command line submissions and operations. Their custom Pi entries stay outside model messages. All configuration and model text editing continues through the existing [profile API](profiles.md#api) until its headless commands ship. No parallel profile format or model text store is introduced.

## Code

- [Client](../../packages/independum/src/run-headless.ts), [connection and startup](../../packages/independum/src/connect-headless.ts), and [private token file](../../packages/independum/src/private-runtime.ts).
- [Operation journal and observers](../../packages/independum/src/create-operations.ts), [routes](../../packages/independum/src/create-headless-routes.ts), and [exit codes](../../packages/independum/src/operation-exit-code.ts).
- [Chat submission and saved entry reads](../../packages/independum/src/create-chat.ts) and [source detail](../../packages/web/src/chat-detail.tsx).
