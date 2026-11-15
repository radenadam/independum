# Component protocol

This page owns target kernel and component communication. The coordinator accepts this technical design on 2026-11-15 under delegated architectural authority. [Decision 0087](../decisions/0087-local-capture-and-component-protocol.md) records the choice and alternatives. [Decision 0083](../decisions/0083-components-removal-and-origin.md) owns language neutrality. There is no general loader today. The existing one-invocation [hook protocol](../product/hooks.md#script-protocol-and-texts) remains current implementation. This target serves CP-04, CP-14, CP-15, CP-28, CP-30, CP-33, CP-34, and CP-35 in [the checkpoint](../checkpoint.md).

## Transport and identity

Use bidirectional JSON-RPC 2.0 over UTF-8 newline-delimited standard input and standard output. Each line carries one complete protocol frame. Standard output contains only protocol frames. Standard error carries captured diagnostics. Large binary values use broker-owned blob references with identity, digest, size, and media type. References grant only the declared access and remain subject to evidence retention.

The TypeScript SDK also offers an in-process transport. Both transports enforce identical JSON round trips, validation, message ordering, cancellation, errors, and evidence semantics. In-process execution is explicitly trusted. It cannot promise process isolation or protect the host from arbitrary component code. Protocol capability checks do not turn trusted code into sandboxed code. Isolated execution uses the existing [permission and native boundary](../product/permissions.md).

JSON-RPC request ids correlate responses. Every invocation also carries run id, invocation id, parent invocation id, component-instance id, configuration revision, and a deadline or explicit absence. The broker assigns and validates this identity against the captured run graph. Components cannot impersonate another instance or acquire a newer configuration midway through a reply.

Components call one another through the broker. The broker validates destination, contribution contract, dependency, capability, and invocation ancestry. Direct internal calls are not a second integration path. Nested calls keep their parent identity and do not inherit broader authority from a target component.

## Operations

The wire protocol, each contribution contract, and manifests have separate versions. Initialization negotiates compatible minor versions and rejects incompatible majors before contributions become active. A contribution uses only its negotiated contract. The first slice supplies executable schemas and fixtures for the operations below.

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

## Validation and failure

Reject malformed frames, invalid UTF-8, unsupported versions, undeclared operations and capabilities, invalid contribution input, and invalid replacements. Validate exact JSON values without coercion. Structured errors distinguish invalid input, missing dependencies, denied authority, execution failure, cancellation, and protocol failure. They identify component and invocation, the failing contract, precise field locations, and the reason. Owned model-facing failure wording uses declared editable text identities.

An error never means an effect is safe to retry. Record whether dispatch or effects are known, absent, or uncertain. Never automatically retry an effect. The loop's explicit model retry policy remains separate from transport delivery and component execution. A worker exit without a terminal response records an interrupted or failed invocation with the known evidence.

Cancellation requests cessation. Settlement confirms its outcome. On cancellation, revoke further capabilities immediately, coordinate nested work, and terminate isolated workers after their cancellation deadline. Preserve completed effects and record any work whose ending is uncertain. Track actual process exit separately from the response. Leases and resources remain held until owned execution ends. Trusted in-process work has no equivalent forced process termination guarantee.

## Conformance and control

Run the same fixtures over standard streams and the in-process transport. Cover negotiation, JSON round trips, nested correlation, ordering, malformed messages, denied capabilities, progress, terminal outcomes, cancellation races, worker exit, and evidence failure. No TypeScript-only operation may bypass these checks. These fixtures precede dependent implementation.

Screen controls, authoritative files, scripts, and code use the same schemas and operations for the same part. Expose exact source, effective configuration, revision, pending changes, and precise failures. Generic editors and inspection are kernel mechanisms. Component-specific editors and renderers are declared contributions with the same [component lifecycle](components.md).

Sample tests substitute recorded services and make no model call. Effects remain forbidden unless explicitly enabled for that test. Tests disclose substituted services and captured configuration. Successful protocol fixtures establish communication conformance, not complete screen or headless authoring, native isolation, or checkpoint acceptance.
