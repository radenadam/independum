# Current work

The maintainer settles Independum's foundation on 2026-11-14 and 2026-11-15. It is a harness engineering tool, made easy and transparent. [The product definition](product/README.md) owns intent. [Decisions 0081](decisions/0081-harness-engineering-and-two-halves.md) through [0087](decisions/0087-local-capture-and-component-protocol.md) retain provenance and reasons.

## Active step

Slice 1 repairs await independent review and capable-host verification. Slice 2 follows: add the journal and read-only evidence API beside current storage. CP-05 and CP-06 own acceptance. [The roadmap](roadmap.md#harness-engineering-checkpoint) keeps later slices separate. The running app still uses Pi orchestration and current storage.

The question round needs no new product decision. The direct repair task of 2026-11-16 preserves slice 1's boundary and forbids app integration. [The protocol contract](contracts/component-protocol.md) records the implementation correction and its provenance. Ask the maintainer about first encounters when absent-loop explanation and removal presentation approach. Do not reopen settled intent.

## Last step

Slice 1 publishes executable 1.0 boundary schemas, JSON round trips, standard-stream and trusted in-process transports, and reference conformance fixtures in `packages/component-protocol`. The standard-stream reference runs as a real child process in Vitest's final serial group. No running app code imports the SDK. There is no loader, journal, provider observation, migrated tool, or replacement loop.

Implementation and verification remain separate in [the checkpoint](checkpoint.md). Protocol fixtures do not complete CP-03, CP-15, CP-26, or CP-28.

Cancelled responses now remain evidence only, including lifecycle and nested calls. Unencodable terminal outputs and errors produce bounded failures without consuming another sender sequence. Fatal send and receive failures close delivery and terminate owned workers. Failed cancellation dispatch settles pending work, and deadline callbacks contain send errors. Rejected replies retain invocation delivery uncertainty. Misbehaving fixtures exercise both transports, including real children. Regressions demonstrate the defects before repair. The final protocol run passes all 177 tests.

`pnpm format` and checks through TypeScript pass on 2026-11-16. Final `pnpm check` stops at a missing installed `formatly/lib/types.js`. Earlier full runs skip 13 native cases in `create-sandbox.test.ts`, `sandbox-runtime.test.ts`, and `script-hook-sandbox.test.ts`. `tools/run-command.test.ts` cannot collect without a shell. Task restrictions block network and credential fixtures. App delivery failures remain missing evidence.

This worker leaves changes uncommitted. The coordinator owns independent review and capable-host evidence before landing under [the workflow](workflow.md).
