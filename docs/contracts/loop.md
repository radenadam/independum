# Replaceable loop

This page owns target loop responsibilities and migration from Pi orchestration. The coordinator accepts this technical design on 2026-11-15 under delegated architectural authority. [Decision 0085](../decisions/0085-independum-owns-the-loop.md) owns loop replacement. Today [chat integration](../../packages/independum/src/create-chat.ts) still uses Pi's `Agent` and `AgentSession`, durable input storage, and an owned summarizer. This is a target contract, not shipped replacement. It serves CP-01, CP-03, CP-08, CP-13, CP-14, CP-18, CP-19, CP-28, and CP-30 through CP-32 in [the checkpoint](../checkpoint.md).

## Ownership

A loop is a removable [component](components.md), invoked through `loop.run`. A small selectable chat loop adds earlier turns. The default loop adds full tool iteration. Screen controls, authoritative file stages, scripts, and code engineer the same loop operations and schemas. Replacing a loop never changes the sole recorded [kernel model doorway](kernel.md).

The default loop takes these orchestration responsibilities from `Agent` and `AgentSession`:

- Assemble context, including earlier turns, resources, base prompt, facts, tool declarations, and model texts. Select projection and stage chains with exact provenance.
- Start model turns through the kernel, collect output, decide continuation, dispatch tool calls, return results, and settle the reply.
- Schedule sequential tools and parallel batches while committing results in call order. Preserve Read, Write, and Edit serialization for each resolved file.
- Reject every tool call from a truncated response before executing any of them. Keep rejected calls as evidence.
- Apply bounded transient turn retries separately from context-overflow compaction and retry. Link each new kernel call and never rerun completed tool effects.
- Schedule durable input handoff, steering, follow-ups, background completion notes, retry waits, compaction, and warming.
- Coordinate cancellation across streams, tools, nested calls, summaries, retry waits, queues, and owned activities. Distinguish requested stop, reply settlement, and actual worker exit.
- Choose what enters later model context and what Pi persists, while preserving exact evidence even when a message is excluded from future input.

Permission decisions, execution, durable queue storage, and background activities are service contributions. The loop coordinates them through declared capabilities and owns continuation policy. The kernel records and enforces explicit access without choosing harness policy. Removing a service blocks dependent work rather than broadening authority.

## Stages

Keep the seven existing stage identities and their accepted effects. [Hooks](../product/hooks.md#events-and-effects) owns the shipped input and replacement shapes, ordering, limits, editable block reasons, and validation. The component adapter preserves those shapes and behavior while moving invocation from Pi callbacks to the loop.

| Stage | Timing and permitted effect |
| --- | --- |
| `input` | Once at durable handoff of each delivered user input. Replace text and images or block. |
| `before_agent_start` | After trigger and base prompt assembly. Replace system prompt. |
| `context` | Before full transcript projection. Replace conversation without adding system messages. |
| `context_with_system` | After owned context controls. Replace full transcript, including owned prompt and declarations. |
| `before_provider_request` | At Pi's prepared provider body. Replace the complete body or block dispatch. |
| `tool_call` | Before effects. Replace arguments with exact schema validation or block the call. |
| `tool_result` | After execution. Replace model-facing result fields without rewriting authoritative execution usage. |

Stages run in explicit order, one at a time within a chain. Observation cannot transform or block. A block skips later stages in that chain. Default failure policy continues observation and stops transformation. Continue preserves the preceding value and records the failure. Stop prevents later automatic work. Invalid or failed output never falls back to sending an unaccepted original value.

Every replacement is complete and validated against its contribution contract. Null removes optional result fields where the existing shape allows it. Final tool arguments pass authorization after all replacements. A deliberate tool block returns a recorded error result to the model. An input or provider-request block fails the pending reply. Original execution usage remains authoritative after result transformation.

The loop supplies the provider-payload stage handle explicitly to the kernel. The kernel mechanically forwards Pi's payload callback and records original and accepted values. It never chooses the chain. Summary calls use their explicit stage chain through the same kernel path. Provider requirements and Pi compatibility remain visible, and owned wording follows [decision 0072](../decisions/0072-editable-pi-texts.md).

## Durable delivery and cancellation

Retain durable input receipts, exact accepted content, captured model and effort, command expansion provenance, and delivery mode. Run `input` once at handoff, including immediate sends, steers, and follow-ups. Acceptance, receipt retries, held delivery, and removal from a waiting queue do not rerun it.

Consume steering at safe boundaries after the current tools settle. Consume follow-ups at idle. Stop holds waiting work. A fresh explicit Send can proceed while older work remains held, as [decision 0076](../decisions/0076-explicit-send-after-stop.md) requires. A steer retains the running reply's captured setup and stage state. A new reply captures the next applicable configuration.

Preserve completed tool effects after abort. Explain when aborted reply content is absent from later provider input while retaining its original evidence. Background activities keep explicit ownership and launch settings. Adopted background commands retain the established independent lifetime and completion-note rules in [Tools](../product/tools.md#shell). Chat archive, deletion, and server shutdown still settle or stop their owned work without duplicate wake-ups.

## Compaction, retries, and warming

Compaction owns trigger, budget, reserve, boundary, summary texts, replacement policy, and continuation. It can use Pi preparation helpers without giving Pi policy ownership. Every summary calls the kernel and records its exact purpose, input, transformations, output, and outcome. Commit only a complete valid nonempty summary without tool calls. Failed, incomplete, aborted, or invalid summaries leave the original conversation intact. Never silently fall back to Pi's summarizer.

Separate bounded transient turn retries from overflow compact-and-retry. Record waits, causes, bounds, and predecessor call links. Pi's provider transport retries stay attempts within one kernel call. A retry never repeats completed effects. Warming is an explicit kernel call with a captured setup and purpose, not merely a counter. Cancellation reaches all these activities and prevents automatic continuation after recording failure.

## What remains in Pi

Pi owns providers, logins, catalog and model resolution, transport retry implementation, and provider compatibility. Keep originating-model signed or redacted thinking, removal of incompatible thinking, normalized tool call ids, required missing-result insertion, and exclusion of aborted or error replies from later provider input in Pi. Capture those transformations rather than reimplementing provider-specific code.

Continue writing Pi's JSONL session format only through `SessionManager` APIs. The loop chooses projection and persistence policy, while Pi owns format and storage implementation. Link kernel and component evidence through custom entries without making those entries model messages.

## Migration and evidence

Keep the current default operational until replacement passes relevant conformance and journey checks. Add a selectable chat loop, then tool iteration. Migrate steering, turn retries, compaction, and warming in separate slices. Switch the default after parity evidence, then remove the obsolete Pi orchestration bridge separately. [The roadmap](../roadmap.md) owns that sequence.

Parity includes sequential and parallel tools, truncated responses, both retry classes, no repeated effects, stop during every activity, durable delivery across restart, summary failure, exact warming records, Pi compatibility transformations, kernel-only behavior, and replacement by another loop. Exact previews need the same Pi preparation seam as sending. Sample stages use recorded services and no model calls. First-encounter questions about absent-loop explanation wait for implementation. No current requirement status changes from publishing this contract.
