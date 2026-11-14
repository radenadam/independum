# Current work

Repository healing is complete. The maintainer judged the repository-only cold start on 2026-11-13, and the healing landed through the local gates on 2026-11-14. Product building resumes under the conditions of [decision 0071](decisions/0071-repository-healing.md).

On 2026-11-14 the maintainer chose, directly, to follow [the roadmap](roadmap.md) in its order. Each step opens with a question round, as [the workflow](workflow.md#questions-and-planning) describes, and asks the maintainer only what [the working agreement](standard.md#authority) leaves to them.

Passing deterministic checks, AI review, and AI browser QA authorize landing within settled intent, and the maintainer tests the app at milestones. [Decision 0079](decisions/0079-gates-authorize-landing.md) records this.

## Active step

The first roadmap step agrees shared contracts. It opens with a question round on the kernel, the detachable and removable contributions, historical evidence, ownership, and application timing, for CP-02 through CP-08.

## Last step

The step that reproduced and fixed the CP-14 and CP-17 contradictions is complete. A tool call whose arguments differ from its schema fails instead of being converted. [Decision 0080](decisions/0080-private-state-folder.md) denies only the private folder of secrets, so the model reads cut output and user-profile hook scripts run, and writes into the state folder ask. Both follow direct maintainer answers of 2026-11-14.

Implementation is not acceptance. [The checkpoint](checkpoint.md) keeps implementation and verification separate.
