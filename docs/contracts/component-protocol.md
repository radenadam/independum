# Component protocol

This contract owns kernel and component communication. The coordinator accepts this design on 2026-11-15 under delegated architectural authority. [Decision 0087](../decisions/0087-local-capture-and-component-protocol.md) records alternatives. [Decision 0083](../decisions/0083-components-removal-and-origin.md) owns language neutrality. No general loader exists. The one-invocation [hook protocol](../product/hooks.md#script-protocol-and-texts) remains current implementation. This target serves CP-04, CP-14, CP-15, CP-28, CP-30, CP-33, CP-34, and CP-35 in [the checkpoint](../checkpoint.md).

Slice 1 publishes [schemas](../../packages/component-protocol/src/schemas.ts), [transports](../../packages/component-protocol/src/transports.ts), and a [protocol endpoint](../../packages/component-protocol/src/create-protocol-peer.ts) in `@independum/component-protocol`. The SDK has no app dependency or integration. Wire details are delegated worker implementation choices of 2026-11-16 under the direct slice task.

## Transport and identity

Use bidirectional JSON-RPC 2.0 over UTF-8 newline-delimited standard input and standard output. Each line carries one frame. Standard output contains only frames. Standard error carries captured diagnostics. Large binary values use broker-owned blob references with identity, digest, size, and media type. References grant only declared access and remain subject to evidence retention.

Frames are limited to 1 MiB excluding the newline. Larger values require references. Unencodable terminal responses produce recorded, bounded protocol failures preserving delivery uncertainty. If correlation cannot fit, send an uncorrelated bounded failure. Fatal delivery failures close transport and terminate owned workers. A reference names its broker, allowed access, and retention identity. Blob storage is not implemented. Both transports reject lossy JavaScript values, including undefined fields, nonfinite numbers, negative zero, sparse arrays, accessors, custom prototypes, and cycles. Stream faults retain exact bytes as base64 evidence.

The TypeScript SDK also offers an in-process transport. Both transports enforce identical JSON round trips, validation, message ordering, cancellation, errors, and evidence semantics. In-process execution is explicitly trusted. It cannot promise process isolation or protect the host from arbitrary component code. Protocol capability checks do not turn trusted code into sandboxed code. Isolated execution uses the existing [permission and native boundary](../product/permissions.md).

JSON-RPC request ids correlate responses. Every invocation also carries run id, invocation id, parent invocation id, component-instance id, configuration revision, and a deadline or explicit absence. The broker assigns and validates this identity against the captured run graph. Components cannot impersonate another instance or acquire a newer configuration midway through a reply.

Identifiers are nonempty opaque strings. JSON-RPC ids also accept nonnegative safe integers. Deadlines are epoch milliseconds or null. The reference endpoint binds one captured run, instance, and revision. Operation payload field names and explicit nullable slots are defined by the schemas. Kernel evidence uses tagged present values or an absence reason, with six named completeness checks. Provider context and stage values stay JSON, with pinned contribution schemas validating exact arguments and replacements.

Components call one another through the broker. The broker validates destination, contribution contract, dependency, capability, and invocation ancestry. Direct internal calls are not a second integration path. Nested calls keep their parent identity and do not inherit broader authority from a target component.

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

The direct maintainer implementation correction of 2026-11-16 after three reviews requires invocation state machines. Prepared work has absent dispatch and effects. Sending makes both uncertain until dispatch is established. Cancelling revokes authority pending settlement. Settled, cancelled, failed, and interrupted states are terminal. Shutdown preserves each invocation's identity and delivery facts. Known dispatch forbids absent effects.

## Conformance and control

Run the same fixtures over standard streams and the in-process transport. Cover negotiation, JSON round trips, nested correlation, ordering, malformed messages, denied capabilities, progress, terminal outcomes, cancellation races, worker exit, and evidence failure. No TypeScript-only operation may bypass these checks. These fixtures precede dependent implementation.

The [conformance tests](../../packages/component-protocol/src/transport-conformance.test.ts) exercise both transports with reference and misbehaving components. [Seeded model tests](../../packages/component-protocol/src/invocation-model.test.ts) cover transition and delivery interleavings. Streams use real Node children. Process tests run in Vitest's final serial group with the shared 20 second budget and cancellation teardown. The endpoint terminates only explicitly owned workers. It supplies no launcher, isolation, lease manager, loader, model service, or effect service.

Screen controls, authoritative files, scripts, and code use the same schemas and operations for the same part. Expose exact source, effective configuration, revision, pending changes, and precise failures. Generic editors and inspection are kernel mechanisms. Component-specific editors and renderers are declared contributions with the same [component lifecycle](components.md).

Tests disclose substituted services and configuration, make no model call, and forbid effects unless enabled. Passing fixtures establish communication conformance, not authoring, native isolation, or checkpoint acceptance.
