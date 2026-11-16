# Current work

Independum is a harness engineering tool, made easy and transparent. [The product definition](product/README.md) owns intent. [Decisions 0081](decisions/0081-harness-engineering-and-two-halves.md) through [0087](decisions/0087-local-capture-and-component-protocol.md) retain provenance and reasons.

## Active step

Slice 1's capture and correlation repairs await independent review and capable-host verification. Slice 2 adds the journal and read-only evidence API. CP-05 and CP-06 own acceptance. [The roadmap](roadmap.md#harness-engineering-checkpoint) keeps later slices separate. The app still uses Pi orchestration and current storage.

No new decision is needed. The direct seventh-review repair task of 2026-11-16 requires sender-owned request id spaces, collision fixtures and generated events, and fixed reproducible batches for generated tests exceeding about two seconds alone. [The protocol contract](contracts/component-protocol.md) and [conventions](conventions.md) own these corrections. Work stays offline and uncommitted.

## Last step

Slice 1 publishes 1.0 schemas, standard-stream and trusted in-process transports, and conformance fixtures in `packages/component-protocol`. Real children run in Vitest's final serial group. No app code imports the SDK. There is no loader, journal, provider observation, migrated tool, or replacement loop.

Implementation and verification remain separate in [the checkpoint](checkpoint.md). Protocol fixtures do not complete CP-03, CP-15, CP-26, or CP-28.

Separate sender request maps now admit opposite-direction id collisions and correlate responses through outgoing ids. Raw nested requests reuse parent ids across both transports and real children. Component SDK requests also reuse incoming ids. Same-direction reuse with a new invocation remains fatal. The generated alphabet includes collisions. Output capture retains exact bytes through worker exit and stream completion.

Five generated groups use fixed ranges: invocation, lifecycle, differential, capture, and admission. Both 10,000-trace random streams remain exact. All 256 differential traces and 96 capture schedules remain. Focused batches take 0.54 to 1.33 seconds alone. Single-trace child comparisons take about 2.3 seconds.

`pnpm format` and static checks pass on 2026-11-16. All 398 protocol tests pass. Full `pnpm check`: 1084 passed, 64 failed, 17 skipped, one uncollected suite. Native skips: `create-sandbox.test.ts` (9), `sandbox-runtime.test.ts` (3), `script-hook-sandbox.test.ts` (1). No shell prevents `tools/run-command.test.ts` collection. App failures remain in `added-facts`, `create-chat-routes`, `hooks-runtime`, `input-delivery`, `migrate-state-continuity`, `model-settings`, and `profiles-runtime` test files. Offline restrictions prevent independent gates.

Changes remain uncommitted. The coordinator owns independent review and capable-host evidence under [the workflow](workflow.md).
