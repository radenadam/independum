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
pnpm review --task /absolute/task.json --output /absolute/evidence
pnpm qa-review --task /absolute/task.json --output /absolute/evidence
pnpm gate --task /absolute/task.json --output /absolute/evidence
```

`gate` runs `pnpm check`, independent review, and independent browser QA sequentially. Run formatting first. Fresh `codex exec` processes inherit no implementation conversation. Receipts record base, HEAD, source and context fingerprints, CLI, model report, commands, platform, findings, coverage, missing checks, and verdict. The pre-push hook rejects stale receipts or uncovered outgoing commits. Run on the final outgoing commit. Put revision, verdict, coverage, and exceptions in the PR description without private paths.

Review checks accepted behavior, callers, security and lifecycle invariants, false docs, missing surfaces, omitted learning, and unsupported completion claims. QA checks complete agreed journeys in the actual built UI, diagnostics, both themes, 360-pixel touch, long and repeated cases, recovery, and screenshots. [Browser QA](browser-qa.md) owns operation. Development reload also needs evidence when affected. Native enforcement and real phone trust require separate capable hosts.

The coordinator runs QA outside implementation workers' sandbox. The QA CLI uses its own full-access role and must be launched only by that coordinator. Workers never weaken their boundary. The reviewer uses read-only mode. Neither role edits source. Their runner verifies unchanged source afterward.

If Codex is unavailable, explicitly choose `--engine claude` for the documented print-mode fallback. It consumes the same task and result shape. No silent fallback occurs. CLI authentication stays inside installed tools. These are networked development roles, separate from approved product model tests. This offline healing worker cannot execute either role. Codex is absent from its command path, so its adapter still needs host execution.

Authentication failure, timeout, invalid output, missing coverage, missing evidence, source mutation, or unavailable required capability yields fail or incomplete, never pass. Empty findings are allowed. Deduplicate by root cause, distinguish defects, missing evidence and decisions, and omit mechanical formatting findings. Fix implementation without weakening acceptance. [Workflow](workflow.md) bounds repair rounds and records maintainer exceptions honestly.
