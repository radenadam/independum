# Checks and gates

`pnpm format` fixes formatting and safe lint issues. `pnpm check` is deterministic and credential-free. It calls no real model and launches no browser. [Package scripts](../package.json) are the executable command inventory.

## Deterministic coverage

- Biome, TypeScript, and markdownlint check configured syntax, formatting, naming, types, and structure.
- `scripts/check-docs.ts` checks prose punctuation. `scripts/check-context.ts` checks local links and anchors, document owners and budgets, decision numbering and relationships, ledger fields and requirement references. It does not establish semantic agreement.
- Character, layout, comment, code, style, markup, and release-age scripts check their selected patterns. They do not prove every language, security, tooltip, motion, or dependency-age property. The release-age check rejects policy overrides.
- Knip finds unused code under its configuration. jscpd detects token duplication. Neither proves one semantic fact per owner.
- Vitest checks exercised behavior, fixtures, scenario parsing, gate validation, and some native boundaries. A native skip is missing enforcement evidence. Pi inventory tests find fixed fragments, not complete text equality or all new wording.
- CI and the pre-commit hook retain `pnpm check`. Three-platform CI supplements local evidence and does not run AI gates or establish visual quality.

## Local gates

Prepare an absolute-path task manifest using [gate-contract.ts](../scripts/gate-contract.ts). It records acceptance, requirements, context, capabilities, verification ownership, the standing question round, and dated learning. Put it and evidence outside the repository, unless the task explicitly confines writes to an ignored scratch directory.

Run:

```sh
pnpm review --task /absolute/task.json --output /absolute/evidence --model <model-id>
pnpm qa-review --task /absolute/task.json --output /absolute/evidence --model <model-id>
pnpm gate --task /absolute/task.json --output /absolute/evidence --model <model-id>
```

`gate` runs `pnpm check`, the task's Playwright scenarios, independent AI review, and independent AI browser assessment sequentially. Both roles receive current browser evidence. A nonpassing review does not suppress QA. Passing every stage authorizes landing within settled intent, without per-change human inspection or approval. The maintainer tests at milestones and retains [intent authority](standard.md#authority). Run formatting first. Fresh `codex exec` processes inherit no implementation conversation. Receipts record revisions, fingerprints, runner-selected engine and model, commands, platform, findings, coverage, missing checks, and verdict. Supply a concrete model id through `--model`. The runner pins it on each CLI invocation and supplies identity to results. Roles never infer their identity. The pre-push hook requires both roles to pass and rejects stale receipts or uncovered outgoing commits. Run on the final outgoing commit.

Review checks accepted behavior, callers, security and lifecycle invariants, false docs, missing surfaces, omitted learning, and unsupported completion claims. It flags reintroduced personal landing gates and preserves maintainer intent authority. QA checks complete agreed journeys in the actual built UI, diagnostics, both themes, 360-pixel touch, long and repeated cases, recovery, and screenshots. [Browser QA](browser-qa.md) owns operation. Development reload also needs evidence when affected. Native enforcement and real phone trust require separate capable hosts.

The coordinator launches the gate outside implementation workers' sandbox. The runner builds the UI and executes every manifest scenario through the Playwright harness with the task base. It retains scenario logs and output paths, checks current revision captures, screenshots, values, and diagnostics, and gives that evidence to QA. `--browser` selects an installed browser as for `pnpm qa`. Both AI roles use read-only investigation. Workers never weaken their boundary. Source changes invalidate evidence.

If Codex is unavailable, explicitly choose `--engine claude` for the documented print-mode fallback. It consumes the same task and result shape. No silent fallback occurs. CLI authentication stays inside installed tools. These are networked development roles, separate from approved product model tests. This offline healing worker cannot execute either role. Codex is absent from its command path, so its adapter still needs host execution.

Authentication failure, timeout, invalid output, missing coverage, missing evidence, source mutation, or unavailable required capability yields fail or incomplete, never pass. Empty findings are allowed. Deduplicate by root cause, distinguish defects, missing evidence and decisions, and omit mechanical formatting findings. Fix implementation without weakening acceptance. [Workflow](workflow.md) bounds repair rounds and records maintainer exceptions honestly.

The direct maintainer correction of 2026-11-13 identifies receipt validation, inferred model identity, and absent current QA evidence as tooling defects. Gate contract and runner regression tests protect the corrected rules.
