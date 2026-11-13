# Hooks

Decision: [0065](../decisions/0065-script-hooks-and-the-add-on-contract.md). A hook is a configured script that observes or transforms an event. This is the first slice of the approved add-on contract. External add-on manifests and code exports remain planned.

## Configuration

The selected [profile](profiles.md) owns `hooks`, `disabledHooks`, and `hookOrder` under `settings`. Missing values use an empty array, an empty array, and an empty object. The profile file editor edits script definitions and limits. Session opens Hooks for switches, order, failure policy, texts, and evidence. A raw file bundle is not the accepted newcomer authoring workflow. Structured creation and the shared lifecycle remain CP-14 and CP-15. A saved change follows the profile application boundary, so running replies keep their captured setup.

Each definition has a unique `id` matching `^[a-z][a-zA-Z0-9]*$`, an `event`, a `mode` of `observe` or `transform`, and `run`. `run.command` is a nonempty executable argument array. `run.workingDirectory` is `source` for the profile folder or `project` for the chat folder. Relative arguments retain their program's meaning. There is no shell, variable expansion, or quote expansion. A bare executable resolves through the server's command path. Windows resolves native executable files, without shell or batch aliases.

Optional `match.toolNames` contains exact model tool names and applies only to tool events. An omitted filter matches everything and an empty filter matches nothing. `disabledHooks` names configured ids without duplicates. `hookOrder` maps event names to complete ordered id arrays, including disabled hooks. Without an explicit order, profile array order applies. Unknown fields, duplicate ids, unsupported events, and incomplete order arrays fail profile validation.

Limits are `timeoutMs`, `inputLimitBytes`, `outputLimitBytes`, and `errorLimitBytes`. Their defaults are 10000 milliseconds, 64 MiB, 16 MiB, and 1 MiB. Byte limits are positive integers. `timeoutMs` is a positive integer or null. The process deadline includes native startup and input delivery. The delivered envelope captures the deadline after authorization, and total duration includes approval waiting. An exceeded limit fails instead of accepting a prefix as complete output.

`onError` is `stop` or `continue`. When omitted, observation continues and transformation stops. Continue keeps the preceding event value and records the failure. Stop blocks later automatic work in the reply. A failed invocation never retries itself or disables its hook.

## Events and effects

| Event | Input data | Replacement | Block |
| --- | --- | --- | --- |
| `input` | Pi input text, images, source, and delivery mode | `{ text, images }` | Yes |
| `before_agent_start` | Pi trigger and the assembled system prompt | `{ systemPrompt }` | No |
| `context` | Pi conversation without system messages | `{ messages }` | No |
| `context_with_system` | Full transcript after owned context controls | `{ messages }` | No |
| `before_provider_request` | `{ payload }` with the complete provider body | The complete body object | Yes |
| `tool_call` | Tool name, call id, arguments, and optional parent call id | `{ input }` | Yes |
| `tool_result` | Tool name, arguments, content, details, error flag, and available usage | `{ content, structuredContent, details, isError, usage }` | No |

Every replacement supplies every field in its shape. Null result fields explicitly remove optional data. Usage from the original tool execution remains authoritative. Ordinary context cannot supply system messages. Full transcript hooks own their replacement prompt and declarations. Final request hooks run after transcript projection. The owned compaction summarizer also dispatches the final request hook and saves its accepted payload separately.

Hooks run one at a time, and a block skips later hooks in that chain. Every tool argument replacement validates against the registered tool. The final arguments pass the tool's permission gate before execution. A deliberate tool block returns an error result to the model, which can choose its next action. An input or request block fails the pending reply. Failure guards at Pi's public callback seams prevent its caught extension errors from sending the original request.

Every delivered user message passes through `input` once at handoff, including immediate messages, queued follow-ups, and steers. Acceptance, removal, held delivery, and receipt retries do not invoke hooks. [Waiting messages](message-box.md#waiting-messages) keep their captured model, effort, and command source through delivery. A new reply resets stopped hook state, while a steer keeps the running reply's hook state.

## Script protocol and texts

Public TypeScript types are exported from `independum/hook-contract`. `HookInput` has API version 1, invocation and event ids, hook id, chat id, nullable leaf id, project folder, start and deadline times, nullable model selection, empty standalone settings, and `data`. It omits Pi's repeated event type and nonserializable values. It contains no authentication objects, environment contents, credential headers, or provider options.

The script reads one UTF-8 JSON object from standard input until it closes. It writes exactly one JSON object to standard output, with optional trailing whitespace. Standard error is for diagnostics. Only exit code 0 permits an effect. Every other exit code, invalid UTF-8, empty output, invalid JSON, unsupported version, unknown field, or unsupported effect fails. A response has `apiVersion: 1` and `action` of `continue`, `replace`, or `block`. Only replace accepts `replacement`. Only block accepts `reason`. Observation accepts only continue.

A block reason is `{ id, values }`. Its id names the hook's inline `texts` record. Each text declares `label`, `builtIn`, and `slots`. Each slot declares `meaning` and `example`. Values supply exactly the declared slot names with strings or finite numbers. Text identity is `hook.<hookId>.<textId>`, and its editor group is `Hook <hookId>`. Fixed host failure text belongs to Hooks. Text edits live in the profile's existing model text file, and use the same changed-default and reset behavior as tool texts.

For a project-scoped profile, add this definition under `settings.hooks` and put `guard.ts` beside that profile file. A user-scoped profile lives inside the denied state folder, so this example does not work there. That storage contradiction is a static finding requiring behavioral reproduction under CP-14.

```json
{
  "id": "guard",
  "event": "tool_call",
  "mode": "transform",
  "match": { "toolNames": ["Shell"] },
  "run": { "command": ["node", "guard.ts"], "workingDirectory": "source" },
  "texts": {
    "blocked": { "label": "When the workflow blocks a command", "builtIn": "The workflow blocks this command.", "slots": {} }
  }
}
```

```ts
import type { HookInput, HookOutput } from "independum/hook-contract";

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
}
const event = JSON.parse(input) as HookInput;
const arguments_ = event.data.input as { command: string };
const output: HookOutput = arguments_.command.includes("publish")
  ? { apiVersion: 1, action: "block", reason: { id: "blocked", values: {} } }
  : { apiVersion: 1, action: "continue" };
process.stdout.write(JSON.stringify(output));
```

This workflow filter is user code and grants no access. All script operations still use [permissions](permissions.md). Hooks require project mode in this slice. Like chat commands, the native adapter receives system read roots, project writes, and nested read-only protection for project `.independum`, where project hooks live. Independum's state folder stays denied. The editable permission fact describes Linux's empty private masks and their temporary writes. Source folders outside the project and runtime startup need no approval unless a saved read rule asks for it. Outside writes and network access need explicit authority. API delivery remains headless by default, and unresolved approval fails without launching code. Browser delivery shows its approval beside the chat.

## Inspection and reload

Session lists every configured hook and shows its last invocation. Details disclose the definition, exact input, standard output, standard error, accepted data, exit code, duration, revision, and generation. Running hooks appear beside the message box with an individual stop action. Reply Stop also cancels them. Changing the selected chat leaves other chats running.

The Hooks detail explains when scripts run, where their definitions and limits are saved, and how changed script files affect the next run. The shared profile note shows its folder once. Invocation details label the captured generation as the script version.

Evidence lives beneath `outputs/<chatId>/hooks/<invocationId>` in the Independum home, with `input.json`, `result.json`, and `stderr.txt`. Records survive browser reconnection and runtime reopening. A server interruption marks an unfinished record cancelled when reopened. Records do not become model messages. Deleting the chat deletes these outputs.

Executable and existing file arguments are fingerprinted only after permission. A captured file that changes refuses before native launch. Reload scripts clears that generation's captured fingerprints. Captured entry fingerprints persist in `sources.json` across runtime reopening. Reload refuses while hooks run, so the user can stop them first. This slice does not track transitive imports or arbitrary files that a script later evaluates. Those belong to the full add-on loader work.

## API

All routes use the existing token, host, and origin checks under `/api/chats/:id`.

| Method and path | Behavior |
| --- | --- |
| `GET /hooks` | Applied definitions, order, switches, source, generation, revision, and recent evidence. |
| `GET /hooks/invocations` | Recent invocation evidence. |
| `GET /hooks/invocations/:invocationId` | One recent captured invocation, or 404. |
| `POST /hooks/invocations/:invocationId/stop` | Cancel the addressed chat's active invocation, or 404. |
| `POST /hooks/reload` | Reload after work ends. `If-Match` carries the effective hook revision. Missing precondition returns 428, a stale revision returns 412, and running work returns 409. |

The profile routes own definitions, switches, order, policies, and model text edits. They retain their existing conditional-save contract.

## Remaining work

The [roadmap](../roadmap.md) lists the rest of the approved contract. This slice has no code add-ons, tools from manifests, prompt pieces, background activities owned by add-ons, hook fixture action, notes, lifecycle events, or hook-requested continuations. Session and the invocation API currently expose the newest 100 records. Older records remain on disk. Provider retry, cache warming, large history, and full native descendant coverage still need their dedicated conformance checks. Entry fingerprints persist across runtime reopening, and transitive code changes are not tracked.

## Code

- [Contract and validation](../../packages/independum/src/hook-contract.ts), [dispatcher and evidence](../../packages/independum/src/create-script-hooks.ts), and [sandbox executor](../../packages/independum/src/execute-script-hook.ts).
- [Pi integration](../../packages/independum/src/create-chat.ts), [chat routes](../../packages/independum/src/create-chat-routes.ts), and [Session detail](../../packages/web/src/hooks-detail.tsx).
