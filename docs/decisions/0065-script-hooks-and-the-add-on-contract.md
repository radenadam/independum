# Script hooks and the add-on contract

- Status: accepted, with the remaining contract implementation listed in `docs/roadmap.md`, amended by [decision 0073](0073-component-removal-and-kernel.md), extended by [decision 0075](0075-control-parity-and-newcomer-journeys.md) for complete tool lifecycle control
- Date: 2026-11-06

## Context

The maintainer approves hooks as a way to build workflows and automations. The approved proposal defines one versioned add-on contract for built-ins and external components. Since that proposal, profiles own agent settings, context has an owned request pipeline, permissions have an operating system boundary, and chat routes name their chat.

The maintainer permits script hooks for request and tool events to ship first when the complete contract is too large for one change. Pi supplies typed event boundaries, but catches errors in some transforming handlers. Throwing inside those handlers alone cannot enforce a stopping failure policy.

## Decision

- The first slice supports standalone script hooks for `input`, `before_agent_start`, `context`, `context_with_system`, `before_provider_request`, `tool_call`, and `tool_result`. [The hook contract](../product/hooks.md) defines their effects and protocol.
- A profile owns `hooks`, `disabledHooks`, and `hookOrder`. Their edits follow the applied profile boundary of decision 0061. Hooks never read another profile's settings while a reply runs.
- Hooks run sequentially. Every successor receives the accepted value of its predecessor. An explicit order includes disabled hooks exactly once. Filters use exact model tool names. An empty filter matches nothing.
- Observation defaults to continuing after failure. Transformation defaults to stopping. Both policies are editable. Continue discards the failed effect. Stop prevents subsequent automatic work in that reply. A deliberate tool block affects only its call.
- Script processes use the permission gate, approvals, environment policy, protected configuration, and native adapter of decision 0063 as amended by decision 0067. Like chat commands, hooks read everywhere except denied paths and write only inside the project unless explicitly granted more access. Project `.independum` stays read-only, Independum's state folder stays denied, and startup reads need no approval. The permission fact describes Linux's private masks for denied folders. This slice requires project permission mode and refuses unrestricted mode instead of launching a hook without isolation.
- The script receives one versioned JSON input on standard input and returns one JSON response on standard output. Nonzero exit codes, invalid output, invalid effects, byte limit violations, deadlines, and cancellation fail the invocation. Standard error stays diagnostic and never automatically reaches the model.
- Tool argument replacements validate before reaching another hook. The permission adapter validates and authorizes the final input immediately before execution. Tool result rewrites explicitly remove stale structured content and retain original usage accounting.
- Public context and payload guards reject stopped requests after Pi finishes its handlers. Compaction's owned summary request uses the same final request dispatcher. Ordinary context hooks precede Pi's restoration of prompt and tools. Full transcript hooks follow the existing owned projection.
- Session shows the configured hooks, order, switches, failure policies, inline model texts, and invocation evidence. Running hooks appear beside the message box with a stop action. Existing profile file editing owns definitions and limits.
- Each invocation saves input, output, accepted values, standard error, timing, exit code, revision, and generation beneath the chat's outputs. Records do not enter model context. Failure to save evidence stops the operation. Deleting a chat removes its records through the existing output lifecycle.
- Entry scripts and executable files are fingerprinted after authorization. A changed captured file refuses execution until an explicit reload. Reload refuses while an invocation runs. Dependency tracking and candidate add-on generations remain part of the full loader work.
- Inline block reasons and fixed hook failures are registered model texts with the existing edit and reset behavior. Hook definitions declare the inline text defaults. Removing a hook with saved text edits requires removing those edits in the same profile save.

## Consequences

- Decisions 0006 and 0053 now have an accepted contract direction, but external add-ons and the built-in migration remain unimplemented. This slice does not claim that built-ins use an add-on manifest.
- Profiles replace the proposal's global runtime settings, the owned context pipeline replaces a second prompt builder, and every hook route lives under `/api/chats/:id/`.
- Pi has the event and callback seams. Independum supplies strict configuration validation, ordered script dispatch, controlled failure state, process limits, permission integration, and durable inspection.
- The full contract still includes manifests, code add-ons, prompt pieces, declared settings, public activities and presentations, fixture testing, lifecycle and boundary events, and eight hook-requested continuations with a nullable limit. None of those effects is accepted by this script slice.
- Native enforcement and browser verification require supported execution hosts. The tests distinguish native setup failures from contract failures.
