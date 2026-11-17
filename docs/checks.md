# Checks and gates

`pnpm format` fixes formatting and safe lint issues. `pnpm check` is deterministic and credential-free, without models or browsers. [Package scripts](../package.json) list commands.

## Deterministic coverage

- Biome, TypeScript, and markdownlint check configured syntax, formatting, naming, types, and structure.
- `scripts/check-docs.ts` checks prose punctuation. `scripts/check-context.ts` checks local links and anchors, document owners and budgets, decision numbering and relationships, ledger fields and requirement references. It establishes no semantic agreement.
- Character, layout, comment, code, style, markup, and release-age scripts check selected patterns, including test-budget waits. They cannot prove every language, security, tooltip, motion, or dependency-age property. Release-age checks reject policy overrides.
- Knip finds unused code under its configuration. jscpd detects token duplication. Neither proves one semantic fact per owner.
- Vitest checks behavior, scenarios, gates, and native boundaries. Its reporter names unavailable tests with reasons, platform skips declare CI platforms, and skips never pass. Native skips remain missing evidence. Pi inventory tests check fragments.
- Vitest serializes native sandbox files, the file-worker test, and, last, server and gate process files, because concurrent containers and load time them out. `require-serial-sandbox.ts` rejects native launches from parallel tests.
- CI and the pre-commit hook retain `pnpm check`. Required CI runs native sandbox tests on Linux and macOS before merge, so the gate needs native evidence only for its own platform. CI runs no AI gates and establishes no visual quality.

## Local gates

Prepare an absolute-path manifest with the fields [gate-contract.ts](../scripts/gate-contract.ts) defines, naming only worktree files. Confined tasks keep evidence in ignored scratch.

Run:

```sh
pnpm review --task /absolute/task.json --output /absolute/evidence --model <model-id>
pnpm qa-review --task /absolute/task.json --output /absolute/evidence --model <model-id>
pnpm gate --task /absolute/task.json --output /absolute/evidence --model <model-id>
```

`gate` sequentially runs checks, browser regressions, scenarios, and independent AI review and browser assessment. A nonpassing review does not suppress QA. Passing every stage authorizes landing, as [the working agreement](standard.md#authority) states. Role processes inherit no conversation. Receipts retain revision-bound evidence, findings, coverage, verdict, and the pinned concrete `--model` id. The pre-push hook requires both roles to pass, with head and fingerprints matching the worktree and pushed tree, so run on the final outgoing commit. Its base is Git's remote tip, or a new branch's unique merge base with the destination's advertised default branch. Missing target or commit data blocks pushing.

Review checks behavior, callers, invariants, false docs, missing surfaces, omitted learning, and unsupported completion. It flags reintroduced personal landing gates and preserves maintainer intent authority. QA checks complete agreed journeys in the actual built UI, diagnostics, both themes, 360-pixel touch, long and repeated cases, recovery, and screenshots. [Browser QA](browser-qa.md) owns operation. Affected development reload also needs evidence. Native enforcement and real phone trust require separate capable hosts.

The coordinator launches the gate outside worker sandboxes. It runs the opt-in browser regressions of `scripts/read-gate-browser-checks.ts`, then builds the UI and executes every manifest scenario. `--browser` selects the installed browser, `msedge` by default, through `INDEPENDUM_QA_BROWSER`. Regression receipts retain commands, logs, named results, and the revision, and missing, skipped, failed, or stale evidence blocks a pass. Roles investigate it read-only, and source changes invalidate evidence.

Before roles start, the runner writes `change.diff` against the base, `changed-files.json` with Git statuses, and copies of untracked unignored files, which prompts name and receipt hashes bind to the revision. Untracked symbolic links are copied as target paths marked `isSymbolicLink`. Other entry kinds, extra hard links, folder links on changed, task, or scenario output paths, and swaps before copying stop the gate.

`receipt.json` records fail-closed `testAvailability`. Required skips and missing or malformed reports block passing. Only Unix-only or macOS-only tests on Windows may substitute the CI platforms that `scripts/read-test-availability.ts` binds by file and name. Verified browser regressions replace only their own opt-in skips. Native skips and shell failures require capable-host evidence.

`--engine` selects Codex, the default, or Claude print mode limited to Read, Glob, and Grep, under one contract without silent fallback. Installed tools own authentication. These networked roles differ from product model tests.

Authentication failure, timeout, invalid output, missing coverage or evidence, source mutation, or unavailable required capability yields fail or incomplete. Findings, possibly none, name a checkpoint or acceptance id. Coverage names each acceptance id once. QA cites every scenario. [Workflow](workflow.md) bounds repair rounds and records exceptions.
