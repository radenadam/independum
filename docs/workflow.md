# Workflow

The coordinator owns shared meaning, integration, evidence, and delivery. Delegate understood bounded work when authorized and useful. Serialize shared runtime and contract writers.

## Questions and planning

Start each piece of work, including resumption, with a question round. State the outcome and accepted answer. Identify uncertain purpose, behavior, judgment, or priorities. Give each material question a recommendation and example. Continue until understood. If settled, record that no new decision is needed and proceed. [The standard](standard.md#authority) defines stops. Distant questions wait for related work.

Write a task manifest with outcome, acceptance, preserved behavior, exclusions, requirement ids, base commit, reading, writable and shared files, capabilities, evidence destination, verification owner, and question round. Read proposals whole before implementation. Split oversized work. Keep acceptance through building. [Gate-contract.ts](../scripts/gate-contract.ts) owns the machine shape.

The direct maintainer correction of 2026-11-13 scopes gates to changed context and behavior, without requiring checkpoint completion.

## Learning

Before dependent work continues after a correction, answer, or reversal:

1. Capture speaker, date, exact concern, affected behavior, and source. Classify product requirement, working preference, implementation choice, temporary instruction, or open question. Mark direct, delegated, or inferred provenance. A task is coordinator text, so workers attribute to the maintainer only dated words it quotes.
2. Update the authoritative current page. Replace conflicting guidance and repair decision relationships. Search for other occurrences of the cause.
3. Add a rule, check, regression scenario, or decision in the same change. Record the protection and its location in the manifest's learning entry. Briefly tell the maintainer what understanding changed and where.

Temporary answers update current work and expire with it. Keep no public correction diary, only concise rules and reasons, with decisions for alternatives, reversals, or consequential tradeoffs. Private transcripts preserve exchanges. Public context excludes personal circumstances and machine-specific archive paths. Repeated corrections require investigating failed protection.

At handoff and milestones, replace completed work state, retire exceptions, consolidate examples, and inspect changed context for drift. Context checks enforce budgets, owners, links, decision relationships, and requirement ids. Gate manifest validation requires dated learning, updated owners, and protection references. Review checks omitted learning, maintainer attributions, and semantic agreement.

## Handoff and building

Preflight base revision, dependencies, writable paths, git metadata, shells, browser access, and native capabilities. This prevents repeatedly assigning impossible checks. Handoffs use absolute paths for worktree, task, reading, designs, screenshots, logs, and output. Check each exists and is readable. Never claim unseen evidence was inspected.

Name file scope, shared writers, dependencies, decision ownership, and completion conditions. Allocate decision numbers centrally. Workers implement accepted behavior and update its owning docs. Report deviations before substituting behavior. Results give exact checks, failures, unverified conditions, context updates, and remaining requirements. Workers without writable git metadata leave uncommitted changes.

The coordinator assigns missing browser and native checks to capable roles. QA runs outside workers' sandboxes without evasion. Independent AI review examines the integrated diff, and AI browser QA checks agreed journeys on that revision. Fix findings. Escalate unresolved disagreement with evidence after three repair rounds. A successful rerun does not explain intermittent failure.

Every server, browser, test, and watcher has an owner and teardown. Report stalls and failures promptly. Cold-start cases include incomplete hooks, editable Pi wording versus required protocol, historical rows opening current editors, skipped native tests, and local visual experiments becoming universal rules. Test judgment, not recitation.

## Landing

For ordinary work, update `main` with `git switch main` and `git pull`, then branch as [conventions](conventions.md#commits-and-pull-requests) specifies. Task restrictions override these operations.

Run `pnpm format`, `pnpm check`, and [the local gate](checks.md). Bind evidence to the outgoing revision. Passing deterministic checks, independent AI review, and independent AI browser QA authorize landing within settled intent. Require no per-change human inspection or approval. Review must flag reintroduced personal gates and preserve [maintainer authority](standard.md#authority). [Decision 0079](decisions/0079-gates-authorize-landing.md) records this boundary.

Commit, push, open with `gh pr create`, and enable `gh pr merge --auto --squash`. Keep only one dependent change landing at a time. Watch `gh pr checks --watch`, current-head CI, conflicts, and auto-merge state, then confirm the merge. Fix failed checks on the same branch. Rerun a cancelled job that never reached a runner with `gh run rerun --failed`. Follow the published branch update policy instead of force pushing.

Update the intended checkout, install changed dependencies, and verify the running app against merged code. A PR closes its slice. Only requirement-level implementation and evidence close acceptance.

Pi updates stay separate. Read every intervening changelog and relevant new texts. Update the branch if behind, install, and check. Exercise all login providers and a real call through Pi. Recheck the narrow text patch. Report findings and land through the same gates. Ask the maintainer only for unresolved decisions under the working agreement.

## Context ownership

Budgets count whitespace-separated words including tables and code. This table is executable metadata. Historical decision bodies stay. Current pages link reasons without historical reconstruction.

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
| `docs/roadmap.md` | Coordinator | 750 | Rewrite | Ordered unfinished work |
| `docs/contracts/kernel.md` | Coordinator | 1600 | Reconcile | Kernel evidence contract |
| `docs/contracts/component-protocol.md` | Coordinator | 1400 | Reconcile | Component communication contract |
| `docs/contracts/components.md` | Coordinator | 1400 | Reconcile | Installation lifecycle contract |
| `docs/contracts/tools.md` | Coordinator | 1400 | Reconcile | Universal tool contract |
| `docs/contracts/loop.md` | Coordinator | 1600 | Reconcile | Loop ownership contract |
| `docs/product/*.md` | Area worker | 1200 | Reconcile | Shipped area behavior |
| `docs/product/context.md` | Area worker | 1900 | Reconcile | Resource protocol |
| `docs/product/settings.md` | Area worker | 2200 | Reconcile | Settings protocol |
| `docs/product/hooks.md` | Area worker | 2100 | Reconcile | Script protocol |
| `docs/product/headless.md` | Area worker | 2200 | Reconcile | Command protocol |
| `docs/product/permissions.md` | Area worker | 2200 | Reconcile | Security contract |
| `docs/product/tools.md` | Area worker | 2600 | Reconcile | Six tool contracts |
| `docs/decisions/*.md` | Coordinator | 600 | Keep history | Reasons and provenance |

Schemas, types, tests, and `qa` scenarios own executable contracts without prose budgets.
