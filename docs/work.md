# Current work

The maintainer settles Independum's foundation on 2026-11-14 and 2026-11-15. It is a harness engineering tool, made easy and transparent. [The product definition](product/README.md) owns intent. [Decisions 0081](decisions/0081-harness-engineering-and-two-halves.md) through [0087](decisions/0087-local-capture-and-component-protocol.md) retain provenance and reasons.

## Active step

Publish executable protocol schemas and transport-equivalence fixtures, the first [roadmap slice](roadmap.md#harness-engineering-checkpoint). Cover the [kernel record](contracts/kernel.md), [component messages](contracts/component-protocol.md), [manifests](contracts/components.md), [tools](contracts/tools.md), and [loop](contracts/loop.md) at their shared boundary. Exercise identical JSON round trips, validation, ordering, cancellation, errors, and evidence through standard streams and trusted in-process transport before dependent implementation. CP-03, CP-15, CP-26, and CP-28 own acceptance. These schemas and fixtures are not built yet.

The question round needs no new decision. The direct task of 2026-11-15 supplies the coordinator's delegated acceptance of the proposal with local transport observation replacing upstream dependency. [Decision 0087](decisions/0087-local-capture-and-component-protocol.md) protects that choice. Ask the maintainer about first encounters when absent-loop explanation and removal presentation approach. Do not reopen settled intent.

## Last step

The accepted prose contracts now define the kernel, exact evidence, protocol, component kinds and lifecycle, universal tools, Script, and replaceable loop. The coordinator's implementation choices remain delegated, not direct product answers. This documentation builds none of them and changes no checkpoint status.

Repository healing and CP-14 and CP-17 contradiction repairs remain integrated. Exact argument checks and private state protection ship. [The checkpoint](checkpoint.md) separates implementation from verification.

For this documentation task, `pnpm format` and static checks pass. `pnpm check` reports 686 passing tests, 64 failures, 17 skips including 13 native cases, and one unavailable shell suite. Failures include denied state-path access and timeouts. One delivery timeout repeats with one worker. These remain missing evidence. This offline worker leaves changes uncommitted. The coordinator owns independent review and capable-host checks before landing under [the workflow](workflow.md).
