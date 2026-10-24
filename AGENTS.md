# Independum

Independum is an agent harness built for transparency and control. The user starts it from a terminal and works with the agent in a browser, on a computer or a phone. Every part of the harness, from the system prompt to the tools, is visible and editable from the UI.

This file is the rulebook for every change to this repository, made by a person or an agent. Follow it exactly. `CLAUDE.md` imports this file, so every agent reads the same rules.

## Map

- `packages/independum`: the `independum` command and the local server.
- `packages/web`: the browser UI.
- `docs/glossary.md`: the names of Independum concepts.
- `docs/decisions`: one record per decision, with its reasons.
- `docs/roadmap.md`: current work, next work, and open questions.
- `scripts`: the repository checks behind `pnpm check`.
- `.claude/settings.json`: Claude Code permissions for this repository.

## Commands

| Command | Effect |
| --- | --- |
| `pnpm install` | Installs dependencies and the pre-commit hook. |
| `pnpm dev` | Runs the server and the UI with live reload. |
| `pnpm format` | Fixes formatting and safe lint issues. |
| `pnpm check` | Runs every check. The pre-commit hook and CI run the same command. |
| `pnpm test` | Runs the tests. |

## Workflow

1. Read `docs/roadmap.md` and the decision records that touch the task.
2. If the task depends on an open question in the roadmap, ask the maintainer first, then record the answer as a decision.
3. Update `main` with `git switch main` and `git pull`, then create a branch as described in [Commits and pull requests](#commits-and-pull-requests).
4. Make the change, following the rules below.
5. Leave nothing behind, as described in [No leftovers](#no-leftovers).
6. Run `pnpm format`, then `pnpm check`. Both pass with no errors and no warnings.
7. Commit, push, and open a pull request with `gh pr create`. Then turn on auto-merge with `gh pr merge --auto --squash`.
8. Watch CI with `gh pr checks --watch`. GitHub merges the pull request once every check passes. If a check fails, fix it on the same branch.

GitHub rejects direct pushes to `main`, so every change goes through a pull request.

## Consistency

- Match the existing code. When unsure, find the closest existing example and copy its shape.
- When these rules do not cover a case, choose, then add the rule to this file in the same change. The next agent then chooses the same way.
- Each thing has one way to do it. A change that replaces a pattern migrates every use of the old one, so no half-migration remains.
- A rule that a tool can check becomes a check in `pnpm check`. See decision 0004.

## No leftovers

- Throwaway scripts, experiments, logs, and notes live outside the repository, in an agent scratchpad or the system temp directory. `pnpm check` fails on unexpected files.
- A change deletes the code, files, exports, and dependencies it makes unused. `pnpm check` fails on unused code.
- No commented-out code and no TODO comments. Open work goes in `docs/roadmap.md`.
- No compatibility shims, deprecated aliases, or re-exports under old names. Update the callers instead.
- A change updates every doc it makes wrong, and removes finished items from `docs/roadmap.md`.

## No redundancy

- Before adding a function, component, file, folder, or dependency, search for an existing one and extend it.
- Each fact lives in one place. Other places link to it instead of repeating it.
- `pnpm check` fails on duplicated code.

## Names

- Files and folders are kebab-case, including React components, for example `chat-panel.tsx`.
- A file that exports one function or component is named after it. For example, `run-check.ts` exports `runCheck`.
- Types, interfaces, classes, and React components are PascalCase. Everything else is camelCase, constants included.
- Acronyms are words, for example `httpServer` and `HtmlView`.
- Use full words, such as `context`, `request`, `response`, `error`, and `message`. The only abbreviations are `id`, `url`, `api`, `ui`, and `html`.
- Booleans read as yes-or-no questions, for example `isEnabled` and `hasTools`.
- Names for Independum concepts come from `docs/glossary.md`. A change that introduces a concept adds it there.
- Vague names such as `utils`, `helpers`, `common`, `shared`, `misc`, and `lib` are not allowed. Name things after what they hold.

## Folders

- A folder holds at least two entries. Until it does, its entry stays in the parent folder. `pnpm check` enforces it.
- A package holds `package.json`, `tsconfig.json`, its tool configs, and its code in `src`. A package folder is named after its package, without the `@independum/` scope.
- Tests sit next to their code, for example `create-server.ts` and `create-server.test.ts`.
- A new top-level entry needs a reason, recorded by listing it in `scripts/check-layout.ts`.

## Code

- TypeScript only, with the strict settings in `tsconfig.base.json`. Packages do not loosen them.
- Named exports only. Default exports appear only where a tool requires one, such as `vite.config.ts`.
- Exported functions declare their return types.
- Named functions use `function` declarations. Arrow functions are for callbacks only.
- Loops use `for...of`, never `forEach`.
- No enums, namespaces, or parameter properties. Node runs TypeScript by stripping types, which only works for erasable syntax.
- Relative imports include the file extension, for example `./create-server.ts`.
- Node built-ins use the `node:` prefix, for example `node:fs`.
- No `console`. Command output goes through `process.stdout.write` and `process.stderr.write`. This keeps debug logs out of commits.
- Error messages are sentences that start with a capital letter and end with a period.
- Paths are built with `node:path`, never by joining strings with separators.
- Package scripts run unchanged on Windows, macOS, and Linux. They use no `rm`, no `cp`, no inline environment variables, and no `&`.
- A new dependency must be maintained, work on all three systems, and have no lighter alternative already in the repository.

## Security

- The server listens on `127.0.0.1` only. Network access waits for token auth. See decision 0005.
- Never read, print, copy, or edit `.env`. It holds development credentials, and its contents must stay out of every conversation.

## Real model calls

- Tests and experiments that call a real model use only `claude-haiku-5-5` for Anthropic and `gpt-6-luna` for ChatGPT. See decision 0007.
- The Anthropic key comes from `INDEPENDUM_ANTHROPIC_API_KEY` in `.env` at the repository root. Load it with `node --env-file=.env`, without opening the file.
- The ChatGPT login goes through Pi's `openai-codex` provider, with the browser sign-in done by the maintainer.
- `pnpm check` never calls a real model, so it runs without credentials and costs nothing.

## UI

- Every screen works with touch on a phone screen 360 pixels wide.

## Comments

- The default is no comment. Names and types carry the meaning.
- A comment explains what the code cannot: why a choice was made, an outside constraint, or a trap.
- A comment is one or more complete sentences in plain present tense and neutral voice. It starts with a capital letter, ends with a period, and never uses "we", "you", or "I".
- Comments go on their own line, above the code they explain.
- Line comments use `//`. Block comments are only for doc comments.
- A doc comment is one sentence. It starts with a verb for a function and a noun phrase for a type. Doc comments have no tags such as `@param`, because types already document parameters and return values.
- Never write commented-out code, change history such as "Changed X to Y", restatements of the code, or decorative separators.
- `pnpm check` enforces the format, and `scripts/check-comments.ts` holds the exact rules.

A doc comment fits on one line, or wraps like this:

```ts
/** Options for starting the server. */

/**
 * Returns the session for an id, or undefined when the session was deleted or never existed.
 */
```

## Tests

- Tests use Vitest, with `test` and no `describe`. The file is the group.
- Test names are lowercase phrases without a final period that state the behavior, for example `test("health route reports ok")`.
- Tests exercise behavior through exported functions, not internals.

## Writing

These rules apply to all prose: docs, comments, UI text, error messages, pull request titles, and pull request descriptions.

- Write plainly, with short sentences in the present tense. Instructions use the imperative.
- Connect ideas with explicit words such as "because", "so", "and", or "but", or split them into separate sentences.
- Use no punctuation shortcuts. That means no em dashes, no en dashes, no hyphens used as dashes, no semicolons, no slashes standing for "and" or "or", no ellipses, and no arrows.
- A colon only introduces a list, an example, or code, or separates a label from its description. It never joins two sentences.
- Paths, commands, file names, and code identifiers go in code spans, for example `docs/roadmap.md`.
- Every file holds only printable ASCII, so no emojis, curly quotes, or special dashes appear anywhere. Code writes other characters as escapes, for example `\u2014`.
- `pnpm check` enforces the punctuation rules in Markdown files and comments, and the ASCII rule in every file.

## Markdown

- A Markdown file has one `#` heading. Headings use sentence case.
- Lists use `-`. Code blocks are fenced and name their language. Paragraphs are not hard-wrapped. No HTML.
- A decision record lives in `docs/decisions/NNNN-title-in-kebab-case.md`, numbered in order, with Status, Date, Context, Decision, and Consequences. A change that reverses a decision marks the old record as superseded and links the new one.

## Commits and pull requests

- Branch from `main` as `<type>/<summary-in-kebab-case>`, for example `feat/session-list`.
- Pull request titles follow Conventional Commits, in the form `<type>(<scope>): <summary>`.
  - Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
  - The scope is a package folder name. Leave it out for changes across the repository.
  - The summary is lowercase and imperative, with no final period, for example `feat(web): add session list`.
- One concern per pull request. The description has a `## What` section and a `## Why` section.
- Pull requests merge by squash. The title becomes the commit title on `main`, and the description becomes its message.
