# Component protocol

Kernel and component communication is accepted under delegated coordinator authority, 2026-11-15. [Decision 0087](../decisions/0087-local-capture-and-component-protocol.md) records reasons and [decision 0083](../decisions/0083-components-removal-and-origin.md) language neutrality. The [hook protocol](../product/hooks.md#script-protocol-and-texts) remains current. No general loader exists. Targets: CP-04, CP-14, CP-15, CP-28, CP-30, CP-33, CP-34, and CP-35 in [the checkpoint](../checkpoint.md).

Slice 1 publishes [schemas](../../packages/component-protocol/src/schemas.ts), [transports](../../packages/component-protocol/src/transports.ts), and a [protocol endpoint](../../packages/component-protocol/src/create-protocol-peer.ts) in `@independum/component-protocol`. No app dependency or integration exists. Wire details are delegated choices of 2026-11-16 under direct instruction.

## Transport and identity

Use bidirectional JSON-RPC 2.0 as UTF-8 newline-delimited frames on standard input and output. Standard output contains only frames. Capture diagnostics on standard error. Large binaries use broker-owned blob references with identity, digest, size, and media type. References grant only declared access under evidence retention.

Frames are limited to 1 MiB excluding the newline. Larger values require references. Unencodable terminal responses produce bounded protocol failures preserving delivery uncertainty. If correlation cannot fit, send an uncorrelated bounded failure. Fatal delivery failures close delivery and terminate owned workers. A reference names its broker, allowed access, and retention identity. Blob storage is not implemented. Both transports reject lossy JavaScript values, including undefined fields, nonfinite numbers, negative zero, sparse arrays, accessors, custom prototypes, and cycles. Received frames, faults, and diagnostics retain exact bytes as base64 evidence.

The direct maintainer correction of 2026-11-16 separates delivery closure from capture. Capture both output streams after stop and exit until both end. Release listeners after worker exit and stream completion. Every byte written before exit remains evidence while recording is available. Frames after stop are recorded as late without action. [Capture events](../../packages/component-protocol/src/transport-capture-model.test.ts) cover diagnostics and frames around stop, exit, and stream completion.

The TypeScript SDK offers a trusted in-process transport with identical JSON round trips, validation, ordering, cancellation, errors, and evidence semantics. Capability checks cannot isolate arbitrary trusted code. Isolated execution uses the existing [permission and native boundary](../product/permissions.md).

JSON-RPC ids belong to senders. Opposite directions may reuse ids. Correlate responses by direction and id, then validate invocation identity. Detect same-direction duplicates. Source: direct maintainer repair instruction, 2026-11-16. Broker-assigned invocations carry run, invocation, parent, component-instance, configuration revision, and explicit deadline or absence. Reject impersonation and configuration changes.

Identifiers are nonempty opaque strings. JSON-RPC ids also accept nonnegative safe integers. Deadlines are epoch milliseconds or null. Bind the captured run, instance, and revision. Schemas define fields, nullable slots, evidence values or absence reasons, six completeness checks, and pinned argument and replacement validation.

Components call one another only through the broker, which validates destination, contract, dependency, capability, and ancestry. Nested calls keep parent identity without inheriting broader target authority.

## Operations

Wire, contribution contracts, and manifests have separate `{ major, minor }` versions, initially 1.0. Schema identities end in `:1.0` and use JSON Schema 2020-12. `initialize` selects the highest shared minor under a shared major, rejecting incompatible majors before activation. Requested capabilities and grants are separate. Contributions use only negotiated contracts.

| Operation | Direction and responsibility |
| --- | --- |
| `initialize` | Broker and component negotiate versions, instance identity, available contracts, and granted capabilities. Requested authority is not a grant. |
| `describe` | Broker reads declared contributions, purpose, settings, editable texts, dependencies, and effects without executing a contribution. |
| `dispose` | Broker ends an instance after work settles, requests owned activity shutdown, and records disposal separately from worker exit. |
| `loop.run` | Broker invokes the selected loop with captured setup and accepted input. The loop returns settlement and references its recorded work. |
| `stage.apply` | Loop invokes an ordered observer or transformer with stage input and allowed effects. |
| `tool.execute` | Loop or Script invokes a pinned tool definition with exact validated arguments and its capability handles. |
| `resource.resolve` | A component resolves a declared resource into exact content, source identity, and provenance under granted access. |
| `model.call` | Authorized component requests the sole recorded [kernel model doorway](kernel.md). It supplies all harness choices explicitly. |
| `component.call` | Component requests another declared contribution through the broker. |
| `state.read`, `state.write` | Component requests declared state access. Writes require the permission contract and explicit approval where applicable. |
| `effect.request` | Component requests an external effect through declared permission and execution services. The broker never silently expands authority. |
| `progress`, `log` | Sequenced notifications report progress and diagnostics independently of the terminal response. |
| `cancel` | Request cessation of one invocation and its owned nested work. A terminal response reports settlement. |

Record both directions before exposing accepted effects, including rejected requests, nested calls, progress, diagnostics, cancellation requests, and terminal responses. Sequence records per invocation and preserve parent links across invocations. Each accepted invocation has one terminal outcome. Late messages remain evidence but cannot apply effects after settlement or capability revocation.

Requests carry `wireVersion`, `identity`, `contract`, `sequence`, `capabilities`, and `input` in `params`. Notifications carry correlation fields and `data`. Responses carry identity, contract, sequence, delivery facts, and output or structured failure. Sender sequences start at one per invocation, permitting cancellation and responses to cross. Broker evidence sequences span both directions. Object field order has no meaning. Synchronous evidence recording commits before returning. Authorization validates the captured graph, destination, dependency, pinned definitions, and handles. Fixtures substitute these services. Sink failure stops delivery and capabilities. Durable journaling belongs to slice 2.

## Validation and failure

Record received frames before validation. Reject malformed frames, invalid UTF-8, unsupported versions, undeclared operations and capabilities, invalid contribution input, and invalid replacements. Both peers validate contribution contracts, including received stage effects and pinned tool results, without coercion. Outgoing request denials and encoding failures record absent dispatch and effects. Rejected notifications preserve invocation uncertainty and sender sequence. Undeliverable cancellation closes delivery. Structured errors identify kind, identity, contract, field locations, and reason. Owned model-facing wording uses declared editable text identities.

Nested failure causes retain their original identity, contract, field locations, and delivery facts. A child's absent effects do not establish absence for its parent.

An error never means an effect is safe to retry. Record whether dispatch or effects are known, absent, or uncertain. Never automatically retry an effect. The loop's explicit model retry policy remains separate from transport delivery and component execution. A worker exit without a terminal response records an interrupted or failed invocation with the known evidence.

Cancellation requests cessation. Settlement confirms its outcome. On cancellation, revoke further capabilities immediately and coordinate nested work. A later response settles the caller as cancelled and remains evidence only, including initialization and disposal. Earlier settled outcomes remain unchanged. Terminate isolated workers after their cancellation deadline. Preserve completed effects and uncertain work. Track process exit separately. Leases and resources remain held until execution ends. Trusted in-process work has no equivalent forced termination guarantee.

Direct maintainer corrections of 2026-11-16 require invocation and peer machines to admit handlers, effects, nested calls, and sends. Recheck after authorization and recording. Interruption revokes work independently of cancellation. Prepared delivery is absent, attempted delivery uncertain, and dispatched delivery known. Settlement preserves delivery facts. Only dispatched cancellation arms worker termination.

Peer states: uninitialized, initializing, ready, disposing, disposed, stopped. Steps run to completion. Queue operations called during a step in call order until state commits, including from evidence, authorization, handlers, transports, and abort listeners. Async continuations enter new steps. Reserve counters atomically before callbacks and delivery. Read-only guards inspect current state. Reject concurrent initialization and unsettled disposal. Disposal blocks new work. Commit lifecycle claims before terminal delivery. Failed or cancelled transitions restore prior state. Evidence failure stops recording. Both machines must admit handlers, effects, and sends. Source: direct maintainer eighth-review repair instruction, 2026-11-16.

## Conformance and control

Both transports run fixtures for negotiation, JSON fidelity, nested id collisions, ordering, malformed messages, authority, progress, settlement, cancellation, worker exit, and evidence failure. No SDK-only operation bypasses validation.

[Fixtures](../../packages/component-protocol/src/transport-conformance.test.ts), [generated traces](../../packages/component-protocol/src/invocation-model.test.ts), [admission boundaries](../../packages/component-protocol/src/admission-model.test.ts), and [re-entry traces](../../packages/component-protocol/src/reentry-model.test.ts) compare transports, including real children. Every callback exercises cancel, send, stop, close, dispose, and nested requests. Re-entrant and post-step calls have equal outcomes and strictly increasing directional sequences without duplicates. Fixed ranges keep tests short. Process tests run serially within 20 seconds with cancellation teardown. Termination requires an owned worker.

Screen, authoritative files, scripts, and code share schemas and operations. Expose exact source, effective configuration, revision, pending changes, and precise failures. Kernel editors and inspection support declared component editors and renderers under the [component lifecycle](components.md).

Fixtures disclose substitutions, call no model, and forbid unapproved effects. Passing fixtures establish communication conformance, not authoring, native isolation, or checkpoint acceptance.
