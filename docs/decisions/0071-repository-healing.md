# Repository healing

- Status: accepted, amends [decision 0004](0004-enforce-hygiene-with-checks.md), [decision 0048](0048-session-place.md), [decision 0056](0056-browser-qa-harness.md), and [decision 0057](0057-versions-and-checkpoints.md)
- Date: 2026-11-10
- Source: direct maintainer instruction on 2026-11-09 and approval of the healing proposal and its resumption answer on 2026-11-10

## Context

Historical implementation and merged slices do not preserve current intent or establish complete acceptance. Product building stops while repository context is rebuilt. Code and git history remain. Private conversations remain outside the public repository.

## Decision

Adopt the ownership and budgets in [workflow](../workflow.md#context-ownership), the [product definition](../product/README.md), and requirement-level [checkpoint](../checkpoint.md). Keep current agreement separate from shipped limits and verification. Capture corrections before dependent work continues, with provenance and a lasting rule, check, or decision.

Run deterministic checks, independent local AI review, and independent AI browser QA before ordinary landing. Codex is normal and Claude is an explicitly reported fallback. Replace the direct DevTools driver with Playwright using installed browsers, retaining canonical scenarios and evidence. [Checks](../checks.md) owns operation and limits. This supersedes the driver choice of decision 0056, not its repeatability requirement.

Fresh agents using only the repository must explain the product, checkpoint, authority, and practical correction and change cases. The maintainer reads and judges their answers before lifting the building stop. A quiz score alone is insufficient.

## Consequences

Newcomer usability is current acceptance even while extended learning material remains later. Existing Session components remain useful, but the structural redesign needs journey-level judgment. Decision 0048's arrangement is shipped history rather than acceptance of every later addition.

Version naming from decision 0057 remains delegated naming and does not lower technical readiness. Gates and context checks support judgment without claiming semantic proof. This context change does not implement missing product controls.

`CLAUDE.md` keeps only its import without a heading. Markdownlint exempts only that adapter's heading requirement, and the context check enforces the exact import instead.
