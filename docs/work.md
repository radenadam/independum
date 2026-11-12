# Current work

Building is stopped for repository healing. The maintainer's 2026-11-09 instruction and 2026-11-10 proposal answers govern. [Decision 0071](decisions/0071-repository-healing.md) records the stop and resumption condition.

The active phase is context reconstruction and local gate foundations. Product behavior stays unchanged except the browser harness. Implementation is not acceptance. [The checkpoint](checkpoint.md) records the remaining product gaps separately.

## Current boundary

The healing worker stays offline in its supplied worktree, makes no git mutations, writes nowhere else, and leaves changes uncommitted. Its coordinator owns browser execution and integration. Native sandbox tests can skip here, shell tests can fail without an available shell, and a browser cannot launch. These are missing evidence, not passes. AI gates need network and cannot run in this worker.

## Resume pointers

The 2026-11-12 worker verifies formatting, non-test checks, and focused context, gate, and harness tests. Full tests remain blocked by shell-dependent failures and native skips. Its coordinator must run browser scenarios and AI gates, install the declared pre-push hook, and complete native checks. Then have fresh agents with only the repository explain the product, checkpoint, authority, and practical correction and change cases. The maintainer reads and judges. Record that dated judgment here before lifting the stop. It has not happened.

After healing, [the roadmap](roadmap.md) orders work: reproduce contract contradictions, settle shared contracts, judge interface journeys, deliver one complete component journey, finish the common add-on contract and Pi text patch, finish checkpoint gaps, and assess the whole checkpoint. Later capabilities wait until that assessment passes.

Keep only active state here. Replace this page at handoff instead of appending a diary. Keep revision-bound evidence in the gate output and update implementation and verification separately in the ledger.
