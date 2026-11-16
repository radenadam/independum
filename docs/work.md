# Current work

Independum is a harness engineering tool, made easy and transparent. [The product definition](product/README.md) owns intent. [Decisions 0081](decisions/0081-harness-engineering-and-two-halves.md) through [0087](decisions/0087-local-capture-and-component-protocol.md) retain provenance and reasons.

## Active step

Slice 1's protocol repairs await independent review and capable-host verification. Slice 2 adds the journal and read-only evidence API. CP-05 and CP-06 own acceptance. [The roadmap](roadmap.md#harness-engineering-checkpoint) keeps later slices separate. The app still uses Pi orchestration and current storage.

No new decision is needed. The direct eighth-review repair task of 2026-11-16 requires peer steps to run to completion, callback operations to queue in call order, atomic counter reservation, and generated re-entry equivalence checks. The ninth-review repair adds call-time input copies and terminals after earlier calls. [The protocol contract](contracts/component-protocol.md) owns these corrections. Work stays offline and uncommitted.

## Last step

Slice 1 publishes 1.0 schemas, two transports, and fixtures in `packages/component-protocol`. No app code imports the SDK. There is no loader, journal, provider observation, migrated tool, or replacement loop. Real children run in Vitest's final serial group.

Implementation and verification remain separate in [the checkpoint](checkpoint.md). Protocol fixtures do not complete CP-03, CP-15, CP-26, or CP-28.

Peer steps serialize callback operations. Wire sequences commit before recording and delivery. The package audit also repairs stream byte consumption and channel draining across callbacks. Sender-owned ids, opposite-direction collisions, exact output capture, admission, and worker termination remain covered.

Seven generated groups use fixed ranges. Both 10,000-trace streams, 256 differential traces, 96 capture schedules, and eight child samples remain. Admission exercises every recording point with re-entry. New traces compare callback and post-step operations across both transports, mutate every input, and match synchronous with asynchronous throws. Real children reproduce terminal evidence cancellation, call-time arguments, and ordered notifications.

`pnpm format` and full `pnpm check` pass on 2026-11-16 with 1447 passed and 5 skipped. The skips are Unix-only cases in `private-runtime.test.ts` and `tools/run-command.test.ts` and three opt-in browser regressions that the gate runs separately. All 677 protocol tests pass. Offline restrictions prevent independent gates.

Changes remain uncommitted. The coordinator owns independent review and capable-host evidence under [the workflow](workflow.md).
