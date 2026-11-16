# Current work

Independum is a harness engineering tool, made easy and transparent. [The product definition](product/README.md) owns intent. [Decisions 0081](decisions/0081-harness-engineering-and-two-halves.md) through [0087](decisions/0087-local-capture-and-component-protocol.md) retain provenance and reasons.

## Active step

Slice 1's protocol repairs await independent review and capable-host verification. Slice 2 adds the journal and read-only evidence API. CP-05 and CP-06 own acceptance. [The roadmap](roadmap.md#harness-engineering-checkpoint) keeps later slices separate. The app still uses Pi orchestration and current storage.

No new decision is needed. The direct eighth-review repair task of 2026-11-16 requires peer steps to run to completion, callback operations to queue in call order, atomic counter reservation, and generated re-entry equivalence checks. [The protocol contract](contracts/component-protocol.md) owns this correction. Work stays offline and uncommitted.

## Last step

Slice 1 publishes 1.0 schemas, two transports, and fixtures in `packages/component-protocol`. No app code imports the SDK. There is no loader, journal, provider observation, migrated tool, or replacement loop. Real children run in Vitest's final serial group.

Implementation and verification remain separate in [the checkpoint](checkpoint.md). Protocol fixtures do not complete CP-03, CP-15, CP-26, or CP-28.

Peer steps now serialize callback operations. Wire sequences commit before recording and delivery. The package audit also repairs stream byte consumption and channel draining across callbacks. Sender-owned ids, opposite-direction collisions, exact output capture, admission, and worker termination remain covered.

Six generated groups use fixed ranges. Both 10,000-trace streams, 256 differential traces, 96 capture schedules, and eight child samples remain. Admission exercises every recording point with re-entry. New traces compare callback and post-step operations across both transports. A real child reproduces terminal evidence cancellation while other work completes.

`pnpm format` and static checks pass on 2026-11-16. Full `pnpm check`: 1183 passed, 64 failed, 17 skipped, one uncollected suite. All 609 protocol tests pass across full and final focused runs. Native skips: `create-sandbox.test.ts` (9), `sandbox-runtime.test.ts` (3), `script-hook-sandbox.test.ts` (1). No shell prevents `tools/run-command.test.ts` collection. Existing app failures remain in `added-facts`, `create-chat-routes`, `hooks-runtime`, `input-delivery`, `migrate-state-continuity`, `model-settings`, and `profiles-runtime`. Offline restrictions prevent independent gates.

Changes remain uncommitted. The coordinator owns independent review and capable-host evidence under [the workflow](workflow.md).
