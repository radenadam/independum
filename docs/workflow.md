# Workflow

The coordinator owns shared meaning, integration, evidence, and delivery. Use bounded workers when delegation is authorized and useful. Serialize writers to shared runtime files and contracts. More workers help only while the coordinator can understand their work.

## Questions and planning

Start every piece of work, including resumption, with a question round. State the user outcome and current accepted answer. Identify uncertainty about purpose, behavior, judgment, or changed priorities. For each material question, give a recommendation and concrete example. Continue until enough context exists. If the request and repository settle it, record that no new decision is needed and proceed. [The standard](standard.md#authority) defines when dependent work must stop. Distant questions wait for related work.

Write a task manifest with outcome, acceptance, preserved behavior, exclusions, requirement ids, base commit, reading, writable and shared files, capabilities, evidence destination, verification owner, and question round. Read proposals whole before implementation. Split oversized work. Keep acceptance through building. [Gate-contract.ts](../scripts/gate-contract.ts) owns the machine shape.

The direct maintainer correction of 2026-11-13 scopes gate acceptance to changed context and behavior, without demanding app checkpoint completion.

## Learning

Before dependent work continues after a correction, answer, or reversal:

1. Capture speaker, date, exact working concern, affected behavior, and source. Classify product requirement, working preference, implementation choice, temporary instruction, or open question. Mark direct, delegated, or inferred provenance.
2. Update the authoritative current page. Replace conflicting guidance and repair decision relationships. Search for other occurrences of the cause.
3. Add a rule, check, regression scenario, or decision in the same change. Record the protection and its location in the manifest's learning entry. Briefly tell the maintainer what understanding changed and where.

Temporary answers update current work and expire with it. Keep no public correction diary. Keep a concise rule and reason, with a decision for alternatives, reversals, or consequential tradeoffs. Private transcripts preserve full exchanges. Public context contains no personal circumstances or machine-specific archive paths. A repeated correction triggers an investigation into why protection failed.

At handoff and milestones, replace completed work state, retire exceptions, consolidate examples, and inspect changed context for drift. Context checks enforce budgets, owners, links, decision relationships, and requirement ids. Gate manifest validation requires dated learning, updated owners, and protection references. Review checks omitted learning and semantic agreement, which syntax cannot establish.

## Handoff and building

Preflight base revision, dependencies, writable paths, git metadata, shells, browser access, and native capabilities. This prevents repeatedly assigning impossible checks. Handoffs use absolute paths for worktree, task, reading, designs, screenshots, logs, and output. Check each exists and is readable. Never claim unseen evidence was inspected.

Name file scope, shared writers, dependencies, decision ownership, and completion conditions. Allocate decision numbers centrally. Workers implement accepted behavior and update its owning docs. Report deviations before substituting behavior. Results give exact checks, failures, unverified conditions, context updates, and remaining requirement ids. Workers without writable git metadata leave uncommitted changes.

The coordinator assigns missing browser and native checks to capable roles. QA runs outside implementation workers' sandbox, without asking workers to evade it. Independent AI review examines the integrated diff, and AI browser QA checks the agreed journeys against that revision. Fix findings through implementation. Bound repair to three rounds before escalating unresolved disagreement with evidence. A successful rerun does not explain an intermittent failure.

Every server, browser, test, and watcher has an owner and teardown. Report stalled progress and failure conditions promptly. Cold-start cases include incomplete hook slices, editable Pi wording versus required protocol, historical rows opening current editors, skipped native tests, and local visual experiments becoming universal rules. Test judgment, not recitation.

## Landing

For ordinary work, update `main` with `git switch main` and `git pull`, then branch as [conventions](conventions.md#commits-and-pull-requests) specifies. Task restrictions override these operations.

Run `pnpm format`, `pnpm check`, and [the local gate](checks.md). Bind evidence to the outgoing revision. Passing deterministic checks, independent AI review, and independent AI browser QA authorize landing within settled intent. Require no per-change human inspection or approval. Review must flag reintroduced personal gates and preserve [maintainer authority](standard.md#authority). [Decision 0079](decisions/0079-gates-authorize-landing.md) records this boundary.

Commit, push, open with `gh pr create`, and enable `gh pr merge --auto --squash`. Keep only one dependent change landing at a time. Watch `gh pr checks --watch`, current-head CI, conflicts, and auto-merge state, then confirm the merge. Fix failed checks on the same branch. Rerun a cancelled job that never reached a runner with `gh run rerun --failed`. Respect the published branch update policy rather than assuming force pushes work.

Update the intended local checkout, install changed dependencies, and verify the running app. This prevents merged code and delivered behavior diverging. A PR closes its slice. Only requirement-level implementation and evidence close acceptance.

Pi updates stay separate. Read every intervening changelog and relevant new texts. Update the branch if behind, install, and check. Exercise all login providers and a real call through Pi. Recheck the narrow text patch. Report findings and land through the same gates. Ask the maintainer only for unresolved decisions under the working agreement.

## Context ownership

Budgets count whitespace-separated words including tables and code. The table is executable metadata. Exhaustive protocol pages have explicit larger budgets. Historical decisions keep their bodies. New decisions have 600 words. Current pages link reasons rather than requiring historical reconstruction.

| File | Steward | Budget | Disposition | Single purpose |
| --- | --- | --- | --- | --- |
| `AGENTS.md` | Coordinator | 700 | Rewrite | Entry and critical constraints |
| `CLAUDE.md` | Coordinator | 1 | Keep | One import |
| `README.md` | Coordinator | 350 | Rewrite | Public introduction |
| `docs/product/README.md` | Coordinator | 900 | Rewrite | Product contract and router |
| `docs/standard.md` | Coordinator | 900 | Rewrite | Working agreement |
| `docs/work.md` | Coordinator | 350 | Add | Active state |
| `docs/checkpoint.md` | Coordinator | 1800 | Add | Acceptance ledger |
| `docs/workflow.md` | Coordinator | 1200 | Add | Development process |
| `docs/conventions.md` | Coordinator | 1500 | Add | Editing rules |
| `docs/checks.md` | Gate maintainer | 700 | Add | Verification coverage |
| `docs/design.md` | Coordinator | 1000 | Rewrite | Visual meanings |
| `docs/icons.md` | UI worker | 1500 | Reconcile | Geometry and motion |
| `docs/glossary.md` | Coordinator | 800 | Rewrite | Canonical names |
| `docs/browser-qa.md` | QA owner | 1000 | Reconcile | Browser operation |
| `docs/roadmap.md` | Coordinator | 700 | Rewrite | Ordered unfinished work |
| `docs/product/*.md` | Area worker | 1200 | Reconcile | Shipped area behavior |
| `docs/product/context.md` | Area worker | 1900 | Reconcile | Resource protocol |
| `docs/product/settings.md` | Area worker | 2200 | Reconcile | Settings protocol |
| `docs/product/hooks.md` | Area worker | 2100 | Reconcile | Script protocol |
| `docs/product/headless.md` | Area worker | 2200 | Reconcile | Command protocol |
| `docs/product/permissions.md` | Area worker | 2200 | Reconcile | Security contract |
| `docs/product/tools.md` | Area worker | 2600 | Reconcile | Six tool contracts |
| `docs/decisions/*.md` | Coordinator | 600 | Keep history | Reasons and provenance |

Schemas, types, tests, and `qa` scenarios own executable contracts without prose budgets.
