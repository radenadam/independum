# Independum

This is the shared entry point for contributors and agents. `CLAUDE.md` only imports it. Maintaining repository context and building Independum are equally part of the job.

## Start every session

Read these whole, in order:

1. [Current work](docs/work.md).
2. [Product definition](docs/product/README.md).
3. [Working agreement](docs/standard.md).
4. The relevant requirements in [the checkpoint](docs/checkpoint.md) and the owning product pages linked from the definition.
5. [Workflow](docs/workflow.md) before planning, coordinating, handing over, or landing. Read [conventions](docs/conventions.md) before editing.
6. [Design](docs/design.md) for visible work and [icons](docs/icons.md) for icon work. Read linked current decisions when their reasons affect the task.
7. Owning code, schemas, tests, and scenarios. Open superseded history only to investigate a reversal or contradiction.

Begin each piece of work, including resumed work, with the question round in the workflow. The maintainer owns intent. Agents execute understood work autonomously and own accurate context and evidence. Stop dependent work when intended behavior conflicts or a new product, visual, privacy, security, or removal tradeoff is unresolved. Existing authorization remains valid.

## Critical boundaries

- Never read, print, copy, or edit any file named `auth.json`, `models.json`, or `.env`. Keep credentials out of commands and conversations. Search with `git grep` or ripgrep with ignored files excluded. Never use recursive `grep`.
- Read saved chats when diagnosis needs them. Pi alone writes their format. Exercise real models through Pi and the app. Use only `claude-haiku-5-5` for Anthropic and `gpt-6-luna` for ChatGPT product tests. Development review roles use the installed agent CLI and are separate from product tests.
- Keep private transcripts and personal material outside the public repository. Carry only concise working requirements, provenance, and reasons forward.
- Native launches belong to `packages/independum/src/create-sandbox.ts`, use only `@microsoft/mxc-sdk/v1`, and disable telemetry on every operation. Never fall back from project mode to unrestricted execution. Preserve denied state paths, nested read-only project configuration, exact reads, and host-effect boundary tests. [Permissions](docs/product/permissions.md) owns the full boundary and Linux mask disclosure.
- Keep every API route under `/api/`, authenticated with its allowed host and supplied Origin checked. Local control listens on `127.0.0.1`. Phone authority stays separate. [Server](docs/product/server.md) owns transport details.
- Pi owns providers, logins, models, and the loop. Do not add provider-specific compatibility code. [Decision 0072](docs/decisions/0072-editable-pi-texts.md) permits a small text-control patch. It is accepted work, not shipped support.
- Respect the task's filesystem, network, git, and process boundaries. Preflight capabilities before assigning work. A constrained worker leaves changes uncommitted for its coordinator.

## Keep the context true

Capture each correction or answer in its authoritative page before dependent work continues. Record its speaker, date, kind, and direct, delegated, or inferred provenance. Replace conflicting guidance, search for the shared cause, and add a rule, check, or decision in the same change. [Workflow](docs/workflow.md) owns this mechanism and document ownership and budgets.

A merged slice does not complete its checkpoint requirement. Implementation and verification are separate. Skipped or unavailable checks remain missing evidence. [Checks](docs/checks.md) defines local gates and their limits. Run `pnpm format`, `pnpm check`, and `pnpm gate` before ordinary landing. Follow the workflow for one change at a time. A task-specific exception is recorded honestly and never called a pass.
