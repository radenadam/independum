# Local capture and component protocol

- Status: accepted, amends [decision 0072](0072-editable-pi-texts.md)
- Date: 2026-11-15
- Source: delegated coordinator acceptance of the first-contract proposal with a transport-capture correction, supplied in the maintainer's task on 2026-11-15 under architectural authority delegated that day
- Kind: implementation choice

## Context

[Decision 0082](0082-kernel-without-harness-decisions.md) requires exact saved model calls. Pi's prepared-payload callback misses later HTTP attempts and WebSocket continuation deltas. The proposal recommends waiting for an upstream observation API. The coordinator replaces that dependency with observation inside Independum's process. The maintainer does not post anything to Pi.

[Decision 0083](0083-components-removal-and-origin.md) requires language-neutral components, while [decision 0086](0086-stay-in-typescript.md) keeps TypeScript easiest. A common protocol must preserve authority, evidence, cancellation, and lifecycle across languages and execution modes.

## Decision

Observe actual HTTP attempts and WebSocket sends and receives locally, correlated to each kernel model call, without provider-specific code. Capture application-protocol payloads after transformations and delta construction. Where generic interception cannot reach a transport, use a small local Pi patch adding the missing observation point. Review and revalidate it with Pi updates. This extends decision 0072's narrow patch allowance to observation, without transferring provider compatibility or request construction to Independum.

Record uncovered transports and missing predecessor evidence as incomplete. Never present those calls as exact. Prepared-payload capture remains useful evidence but cannot establish actual transport capture. The [kernel contract](../contracts/kernel.md) owns completeness and durability rules.

Use bidirectional JSON-RPC 2.0 over UTF-8 newline-delimited standard streams. Capture diagnostics on standard error and use broker-owned references for large blobs. The TypeScript SDK's trusted in-process transport uses identical JSON round trips, validation, ordering, cancellation, and evidence semantics. Only isolated workers promise process separation. Components call one another through the broker. [The protocol contract](../contracts/component-protocol.md) owns operations and conformance.

Reject payload-only capture because it misses attempts and deltas. Reject waiting for upstream because exact capture is Independum's responsibility and local observation can supply the missing seam. Reject provider-specific compatibility branches because Pi retains that ownership. Reject a TypeScript-only direct-call contract because it defeats language neutrality and transport parity.

The accepted design also rejects a fixed Pi loop, separate internal tool paths, and hidden executable reinstall caches. They contradict replaceable loop ownership, one tool doorway, and physical removal. [Components](../contracts/components.md), [tools](../contracts/tools.md), and [the loop](../contracts/loop.md) own those contracts.

## Consequences

Transport coverage and call correlation need explicit conformance evidence, including retries, concurrent calls, reused WebSockets, and continuation references. Crash windows, storage volume, cancellation settlement, Windows file leases, component trust, and unavailable old artifacts remain named failure states.

Publish schemas and transport-equivalence fixtures before dependent implementation. Add the journal, then local transport capture, then kernel routing. Keep the current default until loop parity evidence supports replacement. [The roadmap](../roadmap.md) owns landable slices. No implementation or checkpoint status changes with this decision. First-encounter questions wait for their slices.
