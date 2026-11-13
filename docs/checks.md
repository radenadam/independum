# Checks and gates

`pnpm format` fixes formatting and safe lint issues. `pnpm check` is deterministic and credential-free. It calls no model and launches no browser. [Package scripts](../package.json) list commands.

## Deterministic coverage

- Biome, TypeScript, and markdownlint check configured syntax, formatting, naming, types, and structure.
- `scripts/check-docs.ts` checks prose punctuation. `scripts/check-context.ts` checks local links and anchors, document owners and budgets, decision numbering and relationships, ledger fields and requirement references. It does not establish semantic agreement.
- Character, layout, comment, code, style, markup, and release-age scripts check their selected patterns. They do not prove every language, security, tooltip, motion, or dependency-age property. The release-age check rejects policy overrides.
- Knip finds unused code under its configuration. jscpd detects token duplication. Neither proves one semantic fact per owner.
- Vitest checks behavior, fixtures, scenarios, gates, and some native boundaries. Its availability reporter names skips, failures, and uncollected modules with declaration reasons or runtime notes. Native skips remain missing evidence. Pi inventory tests check fragments, not complete equality.
- CI and the pre-commit hook retain `pnpm check`. Three-platform CI supplements local evidence and does not run AI gates or establish visual quality.

## Local gates

Prepare an absolute-path task manifest using [gate-contract.ts](../scripts/gate-contract.ts). Record acceptance, requirements, context, capabilities, verification ownership, questions, and dated learning. Keep evidence outside the repository unless the task confines writes to ignored scratch.

Run:

```sh
pnpm review --task /absolute/task.json --output /absolute/evidence --model <model-id>
pnpm qa-review --task /absolute/task.json --output /absolute/evidence --model <model-id>
pnpm gate --task /absolute/task.json --output /absolute/evidence --model <model-id>
```

`gate` runs `pnpm check`, the task's Playwright scenarios, independent AI review, and independent AI browser assessment sequentially. Both roles receive browser evidence. A nonpassing review does not suppress QA. Passing every stage authorizes landing within settled intent, without per-change human approval. The maintainer tests at milestones and retains [intent authority](standard.md#authority). Run formatting first. Fresh `codex exec` processes inherit no implementation conversation. Receipts record revisions, fingerprints, runner-selected engine and model, commands, platform, findings, coverage, missing checks, and verdict. Supply a concrete model id through `--model`. The runner pins and records it. Roles never infer identity. The pre-push hook requires both roles to pass. Its base must equal Git's supplied remote tip. New branches use the unique merge base with the default branch advertised by the push destination. Missing target or commit data blocks pushing. Head and fingerprints must match both the worktree and pushed tree. Run on the final outgoing commit with that base.

Review checks accepted behavior, callers, security and lifecycle invariants, false docs, missing surfaces, omitted learning, and unsupported completion claims. It flags reintroduced personal landing gates and preserves maintainer intent authority. QA checks complete agreed journeys in the actual built UI, diagnostics, both themes, 360-pixel touch, long and repeated cases, recovery, and screenshots. [Browser QA](browser-qa.md) owns operation. Development reload also needs evidence when affected. Native enforcement and real phone trust require separate capable hosts.

The coordinator launches the gate outside workers' sandbox. It builds the UI and executes every manifest scenario with the task base. It retains logs and output paths, checks revision captures, screenshots, values, and diagnostics, and gives evidence to QA. `--browser` selects an installed browser as for `pnpm qa`. Both roles investigate read-only. Source changes invalidate evidence. The 2026-11-14 direct maintainer repair requires named capability evidence. The gate prints every availability entry and copies it into `receipt.json` as `testAvailability`. A missing or malformed test report blocks a pass. Skips remain missing evidence.

If Codex is unavailable, explicitly choose `--engine claude` for the documented print-mode fallback. It consumes the same task and result shape. No silent fallback occurs. CLI authentication stays inside installed tools. These are networked development roles, separate from approved product model tests. This offline healing worker cannot execute either role. Codex is absent from its command path, so its adapter still needs host execution.

Authentication failure, timeout, invalid output, missing coverage or evidence, source mutation, or unavailable required capability yields fail or incomplete. Empty findings are allowed. Deduplicate causes, distinguish defects, evidence and decisions, and omit formatting findings. Preserve acceptance. [Workflow](workflow.md) bounds repair rounds and records exceptions.

The 2026-11-13 direct maintainer correction identifies uncovered changes, inferred model identity, and absent QA evidence as defects. Contract, revision, and runner tests protect these rules.
