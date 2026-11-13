# Gates authorize landing

- Status: accepted, amends [decision 0012](0012-pi-updates-arrive-as-reviewed-pull-requests.md) and [decision 0071](0071-repository-healing.md)
- Date: 2026-11-13
- Source: direct maintainer answer in the conversation with the coordinator on 2026-11-13, relayed in the correction task
- Kind: working preference

## Context

The coordinator asks whether deterministic checks, local AI review, and browser QA must run before landing and a person must see the result. The maintainer corrects the last condition. Requiring personal inspection of every change defeats the repository's reviewers and QA. The Pi update workflow still requires that approval, while the healing decision names the gates without making their authority explicit.

## Decision

Passing deterministic checks, independent local AI review, and independent AI browser QA authorize landing within settled intent. No maintainer or coordinator inspection or approval is an additional per-change gate. This applies to Pi updates too. Keep their changelog review, login and real-call checks through Pi, and narrow text-patch verification.

The maintainer tests the app at milestones, such as a checkpoint. The maintainer still decides product meaning, new visual and interaction meanings, genuine preferences, changes to accepted promises, new security, privacy and destructive tradeoffs, and tool plans as [the working agreement](../standard.md#authority) specifies. Unresolved intent stops dependent work.

This amends decision 0012's personal review and approval requirement and clarifies decision 0071's landing rule. Preserve their historical bodies. The healing stop still requires the maintainer's repository-only assessment before building resumes. That is a milestone judgment.

## Consequences

[Workflow](../workflow.md#landing) applies the rule to ordinary changes and Pi updates. [Checks](../checks.md#local-gates) keeps revision-bound evidence, independent AI roles, and failure handling. Missing checks remain missing evidence. Coordinator responsibility for integration and capable QA execution creates no personal approval gate. Review must flag any reintroduced per-change human gate or removal of the maintainer's intent authority.
