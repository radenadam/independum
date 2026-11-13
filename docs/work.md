# Current work

Building is stopped for repository healing. The maintainer's 2026-11-09 instruction and 2026-11-10 proposal answers govern. [Decision 0071](decisions/0071-repository-healing.md) records the stop and resumption condition.

The 2026-11-13 direct maintainer correction makes passing deterministic checks, AI review, and AI browser QA sufficient for landing within settled intent. The maintainer tests at milestones. [The working agreement](standard.md#authority) owns authority, and [decision 0079](decisions/0079-gates-authorize-landing.md) records the amendment.

The active phase is context reconstruction and local gate foundations. Product behavior stays unchanged except the browser harness. Implementation is not acceptance. [The checkpoint](checkpoint.md) records the remaining product gaps separately.

## Current boundary

The healing worker stays offline in its supplied worktree, makes no git mutations, writes nowhere else, and leaves changes uncommitted. Its coordinator owns browser execution and integration. Native sandbox tests can skip here, shell tests can fail without an available shell, and a browser cannot launch. These are missing evidence, not passes. AI gates need network and cannot run in this worker.

## Resume pointers

The correction updates landing authority and model-turn wording. Context and prose checks pass. `pnpm format` and `pnpm check` stop at missing Markdownlint dependency files after Biome passes. A separate test run has 313 passes, one skip, and 38 failed suites. Missing TypeBox files block native suites before their skip checks. `tools/run-command.test.ts` reports no default shell. Evidence stays in ignored worktree scratch.

The coordinator must restore dependencies, rerun checks, execute browser scenarios and AI gates, install the pre-push hook, and complete native evidence. Fresh agents must explain the product, checkpoint, authority, and correction and change cases using only the repository. Record the maintainer's milestone judgment here before lifting the stop. It remains pending.

After healing, [the roadmap](roadmap.md) orders work: reproduce contract contradictions, settle shared contracts, judge interface journeys, deliver one complete component journey, finish the common add-on contract and Pi text patch, finish checkpoint gaps, and assess the whole checkpoint. Later capabilities wait until that assessment passes.

Keep only active state here. Replace this page at handoff instead of appending a diary. Keep revision-bound evidence in the gate output and update implementation and verification separately in the ledger.
