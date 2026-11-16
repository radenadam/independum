# Component protocol

The coordinator accepts kernel and component communication on 2026-11-15 under delegated authority. [Decision 0087](../decisions/0087-local-capture-and-component-protocol.md) records alternatives and [decision 0083](../decisions/0083-components-removal-and-origin.md) language neutrality. The [hook protocol](../product/hooks.md#script-protocol-and-texts) remains current. No general loader exists. This target serves CP-04, CP-14, CP-15, CP-28, CP-30, CP-33, CP-34, and CP-35 in [the checkpoint](../checkpoint.md).

Slice 1 publishes [schemas](../../packages/component-protocol/src/schemas.ts), [transports](../../packages/component-protocol/src/transports.ts), and a [protocol endpoint](../../packages/component-protocol/src/create-protocol-peer.ts) in `@independum/component-protocol`. No app dependency or integration exists. Wire details are delegated choices of 2026-11-16 under direct instruction.

## Transport and identity

Use bidirectional JSON-RPC 2.0 over UTF-8 newline-delimited standard input and standard output. Each line carries one frame. Standard output contains only frames. Standard error carries captured diagnostics. Large binary values use broker-owned blob references with identity, digest, size, and media type. References grant only declared access and remain subject to evidence retention.

Frames are limited to 1 MiB excluding the newline. Larger values require references. Unencodable terminal responses produce bounded protocol failures preserving delivery uncertainty. If correlation cannot fit, send an uncorrelated bounded failure. Fatal delivery failures close delivery and terminate owned workers. A reference names its broker, allowed access, and retention identity. Blob storage is not implemented. Both transports reject lossy JavaScript values, including undefined fields, nonfinite numbers, negative zero, sparse arrays, accessors, custom prototypes, and cycles. Received frames, faults, and diagnostics retain exact bytes as base64 evidence.

The direct maintainer correction of 2026-11-16 separates delivery closure from capture. Capture both output streams after stop and exit until both end. Release listeners after worker exit and stream completion. Every byte written before exit remains evidence while recording is available. Frames after stop are recorded as late without action. [Capture events](../../packages/component-protocol/src/transport-capture-model.test.ts) cover diagnostics and frames around stop, exit, and stream completion.

The TypeScript SDK offers a trusted in-process transport with identical JSON round trips, validation, ordering, cancellation, errors, and evidence semantics. Capability checks cannot isolate arbitrary trusted code. Isolated execution uses the existing [permission and native boundary](../product/permissions.md).

JSON-RPC request ids correlate responses. Every invocation also carries run id, invocation id, parent invocation id, component-instance id, configuration revision, and a deadline or explicit absence. The broker assigns and validates this identity against the captured run graph. Components cannot impersonate another instance or acquire a newer configuration midway through a reply.

Identifiers are nonempty opaque strings. JSON-RPC ids also accept nonnegative safe integers. Deadlines are epoch milliseconds or null. The endpoint binds one captured run, instance, and revision. Schemas define payload fields and nullable slots. Kernel evidence tags present values or absence reasons, with six completeness checks. Pinned schemas validate JSON arguments and replacements.

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

Requests carry `wireVersion`, `identity`, `contract`, `sequence`, `capabilities`, and `input` in `params`. Notifications carry the same correlation fields with `data`. Responses carry identity, contract, sequence, delivery facts, and output or structured failure. Each sender counts from one per invocation. This permits cancellation and responses to cross. The broker independently sequences evidence across both directions. JSON object field order has no meaning. The endpoint requires a synchronous evidence sink that commits before returning and an authorization callback for captured graph, destination, dependency, pinned definitions, and handles. Fixtures substitute those services. A sink failure stops delivery and capabilities. Durable journal integration belongs to slice 2 and later routing.

## Validation and failure

Record received frames before validation. Reject malformed frames, invalid UTF-8, unsupported versions, undeclared operations and capabilities, invalid contribution input, and invalid replacements. Both peers validate contribution contracts, including received stage effects and pinned tool results, without coercion. Outgoing request denials and encoding failures record absent dispatch and effects. Rejected notifications preserve invocation uncertainty and sender sequence. Undeliverable cancellation closes delivery. Structured errors identify kind, identity, contract, field locations, and reason. Owned model-facing wording uses declared editable text identities.

Nested failure causes retain their original identity, contract, field locations, and delivery facts. A child's absent effects do not establish absence for its parent.

An error never means an effect is safe to retry. Record whether dispatch or effects are known, absent, or uncertain. Never automatically retry an effect. The loop's explicit model retry policy remains separate from transport delivery and component execution. A worker exit without a terminal response records an interrupted or failed invocation with the known evidence.

Cancellation requests cessation. Settlement confirms its outcome. On cancellation, revoke further capabilities immediately and coordinate nested work. A later response settles the caller as cancelled and remains evidence only, including initialization and disposal. Earlier settled outcomes remain unchanged. Terminate isolated workers after their cancellation deadline. Preserve completed effects and uncertain work. Track process exit separately. Leases and resources remain held until execution ends. Trusted in-process work has no equivalent forced termination guarantee.

Direct maintainer corrections of 2026-11-16 require invocation and peer machines to admit handlers, effects, nested calls, and sends. Recheck after authorization and recording. Interruption revokes work independently of cancellation. Prepared delivery is absent, attempted delivery uncertain, and dispatched delivery known. Settlement preserves delivery facts. Only dispatched cancellation arms worker termination.

Peer states: uninitialized, initializing, ready, disposing, disposed, stopped. Reserve admission before callbacks. Reject concurrent initialization and unsettled disposal. Disposal blocks new work. Commit lifecycle claims before explicitly admitted terminal delivery. Failed or cancelled transitions restore prior state. Evidence failure stops recording. Generated events throw at every recording point and stop or close during authorization and before handlers. No handler, effect, or send starts outside either machine's admitting state.

## Conformance and control

Run the same fixtures over standard streams and the in-process transport. Cover negotiation, JSON round trips, nested correlation, ordering, malformed messages, denied capabilities, progress, terminal outcomes, cancellation races, worker exit, and evidence failure. No TypeScript-only operation may bypass these checks. These fixtures precede dependent implementation.

[Fixtures](../../packages/component-protocol/src/transport-conformance.test.ts), [generated traces](../../packages/component-protocol/src/invocation-model.test.ts), and [admission boundaries](../../packages/component-protocol/src/admission-model.test.ts) compare transports, including real children. Process tests run serially within 20 seconds with cancellation teardown. Termination requires an owned worker.

Screen, authoritative files, scripts, and code share schemas and operations. Expose exact source, effective configuration, revision, pending changes, and precise failures. Kernel editors and inspection support declared component editors and renderers under the [component lifecycle](components.md).

Fixtures disclose substitutions, call no model, and forbid unapproved effects. Passing fixtures establish communication conformance, not authoring, native isolation, or checkpoint acceptance.
