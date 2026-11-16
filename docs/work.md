# Current work

Independum is a harness engineering tool, made easy and transparent. [The product definition](product/README.md) owns intent. [Decisions 0081](decisions/0081-harness-engineering-and-two-halves.md) through [0087](decisions/0087-local-capture-and-component-protocol.md) retain provenance and reasons.

## Active step

Slice 1's output capture repair awaits independent review and capable-host verification. Slice 2 adds the journal and read-only evidence API. CP-05 and CP-06 own acceptance. [The roadmap](roadmap.md#harness-engineering-checkpoint) keeps later slices separate. The app still uses Pi orchestration and current storage.

The question round needs no new decision. The direct repair task of 2026-11-16 requires continued stdout and stderr capture after stop and worker exit until both streams end. [The protocol contract](contracts/component-protocol.md) records the correction. No app integration belongs here.

## Last step

Slice 1 publishes 1.0 schemas, standard-stream and trusted in-process transports, and conformance fixtures in `packages/component-protocol`. Real children run in Vitest's final serial group. No app code imports the SDK. There is no loader, journal, provider observation, migrated tool, or replacement loop.

Implementation and verification remain separate in [the checkpoint](checkpoint.md). Protocol fixtures do not complete CP-03, CP-15, CP-26, or CP-28.

Output capture now retains listeners through actual worker exit and stream completion. Received frames, diagnostics, and faults preserve exact bytes. Frames after stop remain late evidence without dispatch. Generated capture events add 96 schedules across six exit and stream completion orders, six real-child comparisons, and four malformed-output reproductions with actual broker termination. Existing invocation, lifecycle, admission, and differential fixtures remain required. Earlier schedulers substituted transport close, so they could not expose listener removal. The new capture model exercises actual close.

`pnpm format` and static gates pass on 2026-11-16. All 228 protocol tests pass, including existing differential runs. Full `pnpm check`: 914 passed, 64 failed, 17 skipped, one uncollected suite. Native skips: `create-sandbox.test.ts` (9), `sandbox-runtime.test.ts` (3), `script-hook-sandbox.test.ts` (1). No shell prevents `tools/run-command.test.ts` collection. App failures remain in `added-facts`, `create-chat-routes`, `hooks-runtime`, `input-delivery`, `migrate-state-continuity`, `model-settings`, and `profiles-runtime` test files. Offline restrictions prevent independent gates.

Changes remain uncommitted. The coordinator owns independent review and capable-host evidence under [the workflow](workflow.md).
