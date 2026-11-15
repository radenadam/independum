# Current work

The maintainer settles Independum's foundation on 2026-11-14 and 2026-11-15. It is a harness engineering tool, made easy and transparent. [The product definition](product/README.md) owns intent. [Decisions 0081](decisions/0081-harness-engineering-and-two-halves.md) through [0087](decisions/0087-local-capture-and-component-protocol.md) retain provenance and reasons.

## Active step

Slice 2 is next: add the journal and read-only evidence API beside current storage. CP-05 and CP-06 own acceptance. [The roadmap](roadmap.md#harness-engineering-checkpoint) keeps later slices separate. The running app still uses Pi orchestration and current storage.

The question round needs no new product decision. The direct slice 1 task preserves delegated architectural authority and forbids app integration. [The protocol contract](contracts/component-protocol.md) records the SDK package and wire choices with their provenance. Ask the maintainer about first encounters when absent-loop explanation and removal presentation approach. Do not reopen settled intent.

## Last step

Slice 1 publishes executable 1.0 boundary schemas, JSON round trips, standard-stream and trusted in-process transports, and reference conformance fixtures in `packages/component-protocol`. The standard-stream reference runs as a real child process in Vitest's final serial group. No running app code imports the SDK. There is no loader, journal, provider observation, migrated tool, or replacement loop.

Implementation and verification remain separate in [the checkpoint](checkpoint.md). Protocol fixtures do not complete CP-03, CP-15, CP-26, or CP-28.

On 2026-11-16, `pnpm format` and static checks pass. All 79 protocol tests pass. `pnpm check` reports 765 passing tests, 64 failures, 17 skips, and one unavailable suite. Native setup skips 13 cases in `create-sandbox.test.ts`, `sandbox-runtime.test.ts`, and `script-hook-sandbox.test.ts`. `tools/run-command.test.ts` cannot collect without a default shell. Existing app failures include denied state-path access and delivery timeouts. The `input-delivery.test.ts` case "failed replies hold steering inputs until an explicit resume" repeats its timeout with one worker. These are missing evidence, not passes.

This offline worker leaves changes uncommitted. The coordinator owns independent review and capable-host evidence before landing under [the workflow](workflow.md).
