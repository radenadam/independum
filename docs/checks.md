# Checks and gates

`pnpm format` fixes formatting and safe lint issues. `pnpm check` is deterministic and credential-free. It calls no model and launches no browser. [Package scripts](../package.json) list commands.

## Deterministic coverage

- Biome, TypeScript, and markdownlint check configured syntax, formatting, naming, types, and structure.
- `scripts/check-docs.ts` checks prose punctuation. `scripts/check-context.ts` checks local links and anchors, document owners and budgets, decision numbering and relationships, ledger fields and requirement references. It does not establish semantic agreement.
- Character, layout, comment, code, style, markup, and release-age scripts check their selected patterns. They do not prove every language, security, tooltip, motion, or dependency-age property. The release-age check rejects policy overrides.
- Knip finds unused code under its configuration. jscpd detects token duplication. Neither proves one semantic fact per owner.
- Vitest checks behavior, fixtures, scenarios, gates, and some native boundaries. Its reporter names skips, failures, and uncollected modules with reasons. Platform-only skips declare their CI platforms. They stay skipped, never passed. Native capability skips remain missing evidence. Pi inventory tests check fragments, not complete equality.
- CI and the pre-commit hook retain `pnpm check`. Three-platform CI supplements local evidence and does not run AI gates or establish visual quality.

## Local gates

Prepare an absolute-path manifest using [gate-contract.ts](../scripts/gate-contract.ts). Record acceptance, requirements, context, capabilities, verification ownership, questions, and dated learning. Confined tasks keep evidence in ignored scratch.

Run:

```sh
pnpm review --task /absolute/task.json --output /absolute/evidence --model <model-id>
pnpm qa-review --task /absolute/task.json --output /absolute/evidence --model <model-id>
pnpm gate --task /absolute/task.json --output /absolute/evidence --model <model-id>
```

`gate` runs checks, browser regressions, scenarios, independent AI review, and independent AI browser assessment sequentially. A nonpassing review does not suppress QA. Passing every stage authorizes landing within settled intent, without per-change human approval. The maintainer tests at milestones and retains [intent authority](standard.md#authority). `codex exec` processes inherit no implementation conversation. Receipts retain revision-bound evidence, findings, coverage, and verdict. Supply a concrete `--model` id. The runner pins and records identity. Roles never infer it. The pre-push hook requires both roles to pass. Its base must equal Git's supplied remote tip. New branches use the unique merge base with the default branch advertised by the push destination. Missing target or commit data blocks pushing. Head and fingerprints must match both the worktree and pushed tree. Run on the final outgoing commit with that base.

Review checks behavior, callers, invariants, false docs, missing surfaces, omitted learning, and unsupported completion. It flags reintroduced personal landing gates and preserves maintainer intent authority. QA checks complete agreed journeys in the actual built UI, diagnostics, both themes, 360-pixel touch, long and repeated cases, recovery, and screenshots. [Browser QA](browser-qa.md) owns operation. Development reload also needs evidence when affected. Native enforcement and real phone trust require separate capable hosts.

The coordinator launches the gate outside workers' sandbox. It runs both opt-in browser regressions before building the UI and executing every manifest scenario. `--browser` selects the installed browser, defaulting to `msedge`, and supplies `INDEPENDUM_QA_BROWSER`. Regression receipts retain commands, logs, named passing results, and the reviewed revision. Missing, skipped, failed, or stale regression evidence blocks a pass. Both roles receive it and investigate read-only. Source changes invalidate evidence.

The direct maintainer repairs of 2026-11-14 require fail-closed `testAvailability` in `receipt.json`. Required skips block passing roles. Only Unix-only or macOS-only tests on Windows may substitute named CI platforms. `scripts/read-test-availability.ts` binds allowed files, names, and exact platforms. Current exceptions are `unix discovery rejects broad permissions and another owner` and `a command that a signal ends says which signal`, covered by Linux and macOS CI before merge. Verified browser regressions replace only their own opt-in skips. Native skips and shell failures require capable-host evidence. Missing or malformed reports block passing.

If Codex is unavailable, explicitly choose `--engine claude` for the documented print-mode fallback. It uses the same contract without silent fallback. Installed tools own authentication. These networked development roles differ from product model tests. The offline worker cannot execute them.

Authentication failure, timeout, invalid output, missing coverage or evidence, source mutation, or unavailable required capability yields fail or incomplete. Empty findings are allowed. Deduplicate causes, distinguish defects, evidence and decisions, and omit formatting findings. Preserve acceptance. [Workflow](workflow.md) bounds repair rounds and records exceptions.

Contract, revision, and runner tests protect coverage, identity, and QA evidence.
