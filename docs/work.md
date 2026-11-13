# Current work

Building is stopped for repository healing. The maintainer's 2026-11-09 instruction and 2026-11-10 proposal answers govern. [Decision 0071](decisions/0071-repository-healing.md) records the stop and resumption condition.

The 2026-11-13 direct maintainer correction makes passing deterministic checks, AI review, and AI browser QA sufficient for landing within settled intent. The maintainer tests at milestones. [The working agreement](standard.md#authority) owns authority, and [decision 0079](decisions/0079-gates-authorize-landing.md) records the amendment.

The active phase is context reconstruction and local gate foundations. Product behavior stays unchanged except the browser harness. Implementation is not acceptance. [The checkpoint](checkpoint.md) records the remaining product gaps separately.

## Current boundary

The healing worker stays offline in its supplied worktree, makes no git mutations, writes nowhere else, and leaves changes uncommitted. Its coordinator owns browser execution and integration. Native sandbox tests can skip here, shell tests can fail without an available shell, and a browser cannot launch. These are missing evidence, not passes. AI gates need network and cannot run in this worker.

## Resume pointers

Gate receipts require passing roles and runner-selected identity. The runner executes manifest Playwright scenarios before QA, including after nonpassing review. All 14 gate tests and `pnpm format` pass. `pnpm check` passes static checks, then records 621 passes, 12 failures, and 11 skips. No default shell blocks `tools/run-command.test.ts` and 12 `create-chat-routes.test.ts` cases. Native skips: nine `create-sandbox.test.ts` cases and one `script-hook-sandbox.test.ts` case. One Unix-only `private-runtime.test.ts` case skips. Evidence remains in ignored scratch.

The coordinator must rerun checks with a shell, run `pnpm gate` with a concrete model outside the worker sandbox, install pre-push, and complete native evidence. Real CLI and browser execution remain unverified. Fresh agents must explain the product, checkpoint, authority, and correction and change cases from the repository. Record the pending maintainer milestone judgment before lifting the stop.

After healing, [the roadmap](roadmap.md) orders work: reproduce contract contradictions, settle shared contracts, judge interface journeys, deliver one complete component journey, finish the common add-on contract and Pi text patch, finish checkpoint gaps, and assess the whole checkpoint. Later capabilities wait until that assessment passes.

Replace state at handoff. Keep evidence in gate output and implementation and verification separate in the ledger.
