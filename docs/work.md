# Current work

Independum is a harness engineering tool, made easy and transparent. [The product definition](product/README.md) owns intent. [Decisions 0081](decisions/0081-harness-engineering-and-two-halves.md) through [0087](decisions/0087-local-capture-and-component-protocol.md) retain provenance and reasons.

## Active step

Slice 1's peer lifecycle repair awaits independent review and capable-host verification. Slice 2 adds the journal and read-only evidence API. CP-05 and CP-06 own acceptance. [The roadmap](roadmap.md#harness-engineering-checkpoint) keeps later slices separate. The app still uses Pi orchestration and current storage.

The question round needs no new decision. The direct repair task of 2026-11-16 forbids app integration. [The protocol contract](contracts/component-protocol.md) records the correction. First-encounter questions wait for absent-loop explanation and removal presentation.

## Last step

Slice 1 publishes 1.0 schemas, standard-stream and trusted in-process transports, and conformance fixtures in `packages/component-protocol`. Real children run in Vitest's final serial group. No app code imports the SDK. There is no loader, journal, provider observation, migrated tool, or replacement loop.

Implementation and verification remain separate in [the checkpoint](checkpoint.md). Protocol fixtures do not complete CP-03, CP-15, CP-26, or CP-28.

The direct maintainer implementation correction of 2026-11-16 extends invocation transitions to peer lifecycle admission. Pending initialization and disposal reserve their state before callbacks. Only dispatched cancellation can arm worker termination. Evidence failure and negotiated authority belong to the peer machine. Cancellation, settlement, and worker exit stay separate. [The contract](contracts/component-protocol.md) owns these rules.

All 199 protocol tests pass. They include 10,000 invocation traces and 10,000 lifecycle traces. Each of 256 scheduled traces compares outcomes, both peers' records, and delivery facts across in-process and stream transports. Eight also compare real children. They cover lifecycle claims, cancellation boundaries, sibling isolation, single settlement, and recording before action. Seeds and timings print per batch. Each test stays below 20 seconds.

`pnpm format` and static checks pass on 2026-11-16. Full `pnpm check` reports 885 passed, 64 failed, and 17 skipped. Thirteen native skips remain in `create-sandbox.test.ts`, `sandbox-runtime.test.ts`, and `script-hook-sandbox.test.ts`. `tools/run-command.test.ts` cannot collect without a shell. App runtime failures remain missing evidence. Offline task restrictions prevent independent gates.

Changes remain uncommitted. The coordinator owns independent review and capable-host evidence under [the workflow](workflow.md).
