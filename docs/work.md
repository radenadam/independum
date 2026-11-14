# Current work

Repository healing is complete. The maintainer judged the repository-only cold start on 2026-11-13, and the healing landed through the local gates on 2026-11-14. Product building resumes under the conditions of [decision 0071](decisions/0071-repository-healing.md).

On 2026-11-14 the maintainer chose, directly, to follow [the roadmap](roadmap.md) in its order. Each step opens with a question round, as [the workflow](workflow.md#questions-and-planning) describes, and asks the maintainer only what [the working agreement](standard.md#authority) leaves to them.

Passing deterministic checks, AI review, and AI browser QA authorize landing within settled intent, and the maintainer tests the app at milestones. [Decision 0079](decisions/0079-gates-authorize-landing.md) records this.

## Active step

Roadmap step 1: reproduce the exact-call coercion of CP-17, the retained cut output that the model cannot reach in CP-17, and the user-profile hook storage that the state-folder denial blocks in CP-14. Each contradiction is reproduced with a test that fails before its fix. The state-folder security boundary stays intact. A fix that needs a new security, privacy, or product tradeoff waits for the maintainer.

## Next

Roadmap step 2 opens with a question round on the kernel, the detachable and removable contributions, historical evidence, ownership, and application timing, for CP-02 through CP-08.

Implementation is not acceptance. [The checkpoint](checkpoint.md) keeps implementation and verification separate.
