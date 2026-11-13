# Conventions

These rules apply to every change. [Workflow](workflow.md) owns process, [design](design.md) owns visible meanings, and [checks](checks.md) states actual enforcement.

## Consistency and hygiene

- Match the nearest existing example. Search before adding a function, component, file, folder, or dependency and extend an existing owner when possible.
- Each thing has one way. Replacing a pattern migrates every use. Remove unused code, exports, files, and dependencies. No compatibility shims, deprecated aliases, old-name re-exports, commented-out code, or TODO comments.
- Each fact has one authoritative home. Introductions can summarize and link. Update every document made wrong, and remove finished roadmap items.
- Throwaway scripts, experiments, logs, and notes stay outside the repository. A task that forbids outside writes uses an ignored scratch directory within its granted worktree. Never commit that evidence.
- Add missing lasting rules in their owner during the same change. Mechanically check what a tool can check. Change obstructive nonsecurity rules in the same change. Bring privacy or security blockers to the maintainer instead of working around them.

## Names and folders

- Files and folders use kebab-case, including React components. A file exporting one function or component takes its kebab-case name.
- Types, interfaces, classes, and components use PascalCase. Other names, including constants, use camelCase. Acronyms are words, such as `httpServer` and `HtmlView`.
- Use full words. Only `id`, `url`, `api`, `ui`, and `html` are abbreviations. Unit suffixes such as `Ms`, external API names, fixed tool parameters such as `workdir`, and Edit's `old_string`, `new_string`, and `replace_all` retain their spelling.
- Booleans ask yes-or-no questions. Use canonical concepts from [the glossary](glossary.md) and add new concepts there.
- Do not use vague names such as `utils`, `helpers`, `common`, `shared`, `misc`, or `lib`.
- A folder holds at least two entries unless a tool requires the structure. Explicit exceptions live in `scripts/check-layout.ts`.
- A package holds its `package.json`, `tsconfig.json`, tool configs, and code in `src`. Its folder uses the package name without the scope. Tests sit beside code. A new top-level entry needs its reason in `scripts/check-layout.ts`.

## Code

- Use TypeScript and the strict base settings without loosening them. Node strips erasable types. No enums, namespaces, or parameter properties.
- Use named exports. Default exports appear only when a tool requires them. Exported functions declare return types. Named functions use declarations, with arrows only for callbacks.
- Use `for...of`, never `forEach`. Relative imports include extensions. Node built-ins use `node:`. Build paths with `node:path`.
- Use no `console`. Command output goes through `process.stdout.write` and `process.stderr.write`. Error messages are sentences with a capital first letter and final period.
- Package scripts work unchanged on Windows, macOS, and Linux. No `rm`, `cp`, inline environment variables, or `&`.
- Dependencies must be maintained, portable, and have no lighter alternative already present. Use releases at least one day old. Never relax the minimum age policy in `pnpm-workspace.yaml`.
- UI styles live in adjacent CSS modules. Inline styles only pass runtime custom properties. [Design](design.md) owns tokens, motion, composition, and focus constraints.

## Comments and tests

Names and types carry meaning by default. A comment explains a reason, outside constraint, or trap that code cannot explain. Never repeat behavior, change history, or add decorative separators.

Comments use complete sentences, present tense, neutral voice, a capital start, and final period. No first or second person. Put them on their own line above the code. Use `//` for line comments and block comments only for documentation. CSS uses block comments. A doc comment is one sentence, starting with a verb for a function or a noun phrase for a type, with no tags. It can fit one line or wrap with one `*` per line.

Tests use Vitest `test` without `describe`. The file is the group. Names are lowercase behavior phrases without a final period. Exercise exported behavior rather than internals. The shared timeout is 20 seconds because Windows starts Pi and processes slowly. Override only when a test needs more. Await conditions with `waitFor` from `scripts/wait-for.ts`, which uses the test's remaining budget and preserves the failed assertion. Process tests take two to five times longer when other heavy work shares the machine, and fewer workers do not prevent it. Rerun one timeout before calling it a defect, and treat a timeout that repeats on a quiet machine as one.

## Writing and Markdown

Write plain short sentences in present tense. Instructions use imperative verbs. Connect ideas explicitly or split sentences. These rules cover docs, comments, UI text, errors, commits, and pull requests.

Use no punctuation shortcuts: em dashes, en dashes, hyphens as dashes, semicolons, slashes for words, ellipses, or arrows. A colon introduces a list, example, code, or label description. Put paths, commands, filenames, and identifiers in code spans.

Every file uses printable ASCII, with ordinary line breaks and tabs. Write other characters as code escapes. Markdown has one level-one heading except the import-only `CLAUDE.md` adapter. Headings use sentence case. Unordered lists use `-`. Ordered lists may express sequences. Fence code blocks with their language. Do not hard-wrap paragraphs or use HTML. Markdownlint formats Markdown and Biome formats other supported source. Tool configurations are rules, so record any relaxation as a decision.

Decisions use sequential `docs/decisions/NNNN-title-in-kebab-case.md` names and Status, Date, Context, Decision, and Consequences. New records state direct, delegated, or inferred provenance with source and date. Preserve historical bodies. Mark superseded or amended status with links, and link back from the replacement.

## Commits and pull requests

Branch from current `main` as `<type>/<summary-in-kebab-case>`. A coordinator handles git operations when workers cannot. Task restrictions take precedence.

Titles use Conventional Commits, `<type>(<scope>): <summary>`. Types are `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, and `chore`. Scope is a package folder, omitted for cross-repository changes. The summary is lowercase, imperative, and has no final period.

Keep one concern per pull request, with `## What` and `## Why`. Squash merges use its title and description as the commit message. [Workflow](workflow.md#landing) owns checks and landing.
