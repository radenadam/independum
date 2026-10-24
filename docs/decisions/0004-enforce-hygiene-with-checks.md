# Enforce hygiene with checks

- Status: accepted
- Date: 2026-10-24

## Context

The maintainer and contributors work through coding agents across many sessions. Written rules drift, because each session phrases, names, and structures things slightly differently. Leftover files, dead code, and duplication also pile up. For this project, any inconsistency is a defect, even a cosmetic one.

## Decision

A rule that a tool can check becomes a check in `pnpm check`. The pre-commit hook and CI run it on Windows, macOS, and Linux, and it fails on warnings too.

| Tool | Checks |
| --- | --- |
| Biome | Formatting, lint rules, naming, file names, import order. |
| TypeScript | Types, unused locals and parameters. |
| knip | Unused files, exports, and dependencies. |
| jscpd | Duplicated code and docs. |
| markdownlint | Markdown style. |
| `scripts/check-docs.ts` | Punctuation shortcuts in Markdown. |
| `scripts/check-characters.ts` | Characters outside printable ASCII in any file. |
| `scripts/check-layout.ts` | Top-level entries, kebab-case paths, vague names, single-entry folders, file types. |
| `scripts/check-comments.ts` | Comment placement, format, voice, and punctuation. |

Rules that no tool can check live in `AGENTS.md`. When a case is not covered, the change that decides it adds the rule.

## Consequences

- Each file type has one formatter. markdownlint owns Markdown and Biome owns the rest, because Biome's Markdown formatting conflicts with markdownlint's rules.
- A new top-level entry or file type fails until it is listed in `scripts/check-layout.ts`, which makes the change visible in review.
- Tool configuration is part of the rules. Loosening it needs a decision record.
