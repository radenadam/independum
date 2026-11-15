# Kernel and model-call records

This page owns the target kernel boundary and exact evidence contract. The coordinator accepts this technical design on 2026-11-15 under delegated architectural authority, with local transport capture in [decision 0087](../decisions/0087-local-capture-and-component-protocol.md). [Decision 0082](../decisions/0082-kernel-without-harness-decisions.md) owns the product requirement. [Server](../product/server.md) owns today's implementation. These contracts are not shipped. They serve CP-03, CP-05, CP-06, CP-29, CP-31, and CP-32 in [the checkpoint](../checkpoint.md).

## Boundary

Only the kernel calls models. Its runtime responsibilities are component identification and routing, capability enforcement, cancellation, durable evidence, and Pi model access. It supplies generic screen, file, settings, and inspection mechanisms. [The protocol](component-protocol.md) defines component access. [Components](components.md) own harness choices.

The kernel never selects instructions, earlier turns, tools, retries, compaction, warming, or continuation. It accepts explicit context, selected model, serializable nonsecret options, captured configuration, initiating component, purpose, and correlation identifiers through `model.call`. It implements that operation through `pi-ai`'s `Models.streamSimple`. A collecting convenience operation consumes the same recorded stream. Credentials resolve inside Pi and never enter component messages.

Without a loop, Send submits the current message content only. There are no earlier turns, component-added system prompt, tool execution, compaction, or warming. Pi's provider requirements still apply. The screen explains this behavior. Placement of that explanation is a maintainer first-encounter question for the loop slice. A chatbot adds a selectable chat loop. The default agent uses [the default loop](loop.md).

Pi retains provider compatibility, authentication, catalog, model resolution, and provider transport retries. Each transport retry is an attempt within one logical call. A loop retry is another call with a link to its predecessor. Summary and warming calls use this same doorway and identify their purposes. Neither completion nor a retry can bypass recording.

## Record

Every logical call retains these fields or explicit absence with a reason. Record schemas and their versions become executable in the first [roadmap slice](../roadmap.md#harness-engineering-checkpoint).

| Part | Required evidence |
| --- | --- |
| Identity | Record version, call id, parent call id, request, chat, branch, run, invocation, initiating component instance, and purpose, including ordinary work, retry, summary, and warming. |
| Captured setup | Configuration revision, exact component versions and digests, effective settings and editable texts, resource bytes or retained blob references, source paths and pointers, and contribution provenance. |
| Pi input | Exact context and arguments, selected and resolved model, effective nonsecret options, and provider payload before and after accepted transformations. |
| Attempts | Ordered attempt ids, call correlation, transport identity, dispatch and receipt times, actual outgoing application payloads, incoming bytes or frames, errors, and continuation references. |
| Pi output | Immutable copies of every stream event, final message, usage, finish reason, errors, cancellation, and timing. Mutable Pi partial objects are copied at observation time. |
| Outcome | Prepared, dispatch attempted, completed, failed, cancelled, or interrupted, with known delivery facts and any uncertain delivery stated explicitly. |
| Completeness | Coverage of input, attempts, raw output, normalized output, retained blobs, and predecessor evidence, with exact missing portions and reasons. Successful completion alone never establishes exact capture. |

Keep credential references rather than authentication material. Exclude secrets used for authentication from headers and options, and identify those exclusions. Preserve model-bearing payloads exactly. Exact means the application protocol observed by the process, not encrypted network packets or undisclosed provider internals. Parsed events supplement raw received data rather than replace it. Readable inspection and raw evidence identify the same record.

## Local transport observation

Observe actual HTTP attempts and WebSocket sends and receives inside Independum's own process. Bind each observation to its logical call, including concurrent calls, retries, reused connections, and continuation traffic. Capture the final serialized body or frame after transformations and continuation-delta construction. Retain continuation references with links to predecessor records and blobs. Missing predecessor evidence makes that part incomplete.

Use generic transport interception without provider-specific code. Where interception cannot reach a transport, a small local Pi patch adds the missing observation point. Do not wait for an upstream API or ask the maintainer to post anything to Pi. Pi still owns request construction and compatibility. Review and revalidate the patch with Pi updates, as [decision 0087](../decisions/0087-local-capture-and-component-protocol.md) requires.

`onPayload` supplies prepared-body evidence and the loop-supplied stage seam. It cannot prove actual attempt capture. Label calls using an uncovered or ambiguously correlated transport incomplete and name the gap. Never present them as exact. Capture coverage is observable per call, not a blanket claim about a provider. Cover HTTP retries and WebSocket deltas with conformance fixtures before making an exactness claim.

The loop explicitly supplies a capability handle for its provider-payload stage. The kernel forwards Pi's callback mechanically and records the original and accepted values. It does not select a stage chain or invent a payload transformation. Exact preview requires a Pi preparation seam shared with dispatch. Approximate text matching cannot satisfy preview or provenance acceptance.

## Durability and recovery

Persist input before dispatch and observed events before publishing them. Use an append-only journal with retained blobs and links from Pi custom session entries. Preserve order, terminal outcomes, and rejected or cancelled work. Recording failure prevents further automatic work and becomes an explicit failure. It does not silently continue with an unsaved call.

An interruption leaves an incomplete record with uncertain delivery where necessary. Recovery never automatically resubmits it. A cancellation request and the settled outcome are separate facts. Retention and explicit evidence deletion are independent of component detach or disk removal. Evidence contains inert captured material, never a hidden executable restoration bundle.

Exact recorded input supports inspection and replay. Replay creates a new linked call with explicit authority for effects. It cannot promise identical model output or an unchanged external world. Storage limits, missing blobs, partial writes, and unavailable continuation evidence remain explicit rather than silently reducing exactness.

## Today and verification

Today [request storage](../../packages/independum/src/create-saved-requests.ts) overwrites one payload and ignores write failure. [Chat integration](../../packages/independum/src/create-chat.ts) still uses Pi orchestration. [Summaries](../../packages/independum/src/summarize-context.ts) capture separately and warming is counted. These do not implement this record.

Required evidence includes concurrent-call correlation, all transport attempts, continuation chains, immutable stream copies, failures before stream start, cancellation, recording failure, crash recovery, and explicit incomplete coverage. The journal and read-only evidence API land before transport observation and routing. No documentation slice changes checkpoint implementation or verification status.
