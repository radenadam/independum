# Independum

Independum is an agent harness built for transparency and control. The user starts it from a terminal and works with the agent in a browser, on a computer or a phone. Every part of the harness, from the system prompt to the tools, is visible and editable from the UI.

This file is the rulebook for every change to this repository, made by a person or an agent. Follow it exactly. `CLAUDE.md` imports this file, so every agent reads the same rules.

## Principles

Every decision about what the model gets follows these, from the system prompt to each tool and its results.

- Independum is sufficient. It gives the model complete facts, without gaps, and functions that cover every workflow the model may need, and the model decides what to do with them.
- Independum never steers or pads the model. It gives no best practices, and a tool never guesses at what the model meant or quietly fixes what it sent. When a call cannot do exactly what the model asked, it fails and says exactly why, so the model can decide again.
- Independum tells the model where it works and offers the user options. It never changes how a program behaves to make up for what a model does not know. See decision 0035.
- Research into other harnesses shows what works and what fails. It informs a choice that fits these principles, and it is never a design to copy.

## Map

- `packages/independum`: the `independum` command and the local server.
- `packages/web`: the browser UI.
- `docs/glossary.md`: the names of Independum concepts.
- `docs/icons.md`: how every icon is drawn.
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

## Evaluation

The maintainer holds an evaluation after a milestone, at regular times, and whenever something feels off. It audits the build against the standard of the maintainer in three areas: how the agent works, the repository, and Independum itself. Small unevenness counts, because it can point to a problem at the root.

1. The maintainer drives. Fix each thing that the maintainer raises, one small change at a time.
2. The agent asks. Probe the maintainer with questions until the agent knows what the maintainer expects, and the maintainer has nothing left to raise.
3. Every finding becomes lasting: a rule in this file, a check in `pnpm check`, or a decision record. The maintainer never has to say a thing twice.

## Consistency

- Match the existing code. When unsure, find the closest existing example and copy its shape.
- When these rules do not cover a case, choose, then add the rule to this file in the same change. The next agent then chooses the same way.
- Each thing has one way to do it. A change that replaces a pattern migrates every use of the old one, so no half-migration remains.
- A rule that a tool can check becomes a check in `pnpm check`. See decision 0004.
- A rule that blocks good work without protecting privacy or security gets changed in the same change, never worked around. When a rule that protects privacy or security blocks the work, tell the maintainer, who weighs it.

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
- A dependency uses a version that is at least a day old, the minimum release age that pnpm enforces. Never relax that age in `pnpm-workspace.yaml`, because it gives the registry time to pull a compromised release. `pnpm check` enforces it through `scripts/check-release-age.ts`.

## Security

- Every API route sits under `/api/`, where the server requires the access token and accepts requests only from its own address and origin. See decision 0005.
- The server listens on `127.0.0.1` only until network access and phone pairing exist.
- Never read, print, copy, or edit `~/.independum/auth.json`, `~/.independum/models.json`, or any `.env` file. They hold credentials, and their contents must stay out of every conversation.
- Read chats in `~/.independum/sessions` whenever the work needs them, and test with real models through the app, which saves its chats there like any other. Never change a chat file by hand, because Pi owns its format.
- Search with `git grep` or a search tool built on ripgrep, because both skip files that git ignores. Never search with `grep -r`, which reads ignored files such as `.env` and prints what they hold.

## Real model calls

- Tests and experiments that call a real model use only `claude-haiku-5-5` for Anthropic and `gpt-6-luna` for ChatGPT. See decision 0007.
- They use the maintainer's logins in `~/.independum`, loaded through Pi as in `packages/independum/src/create-model-runtime.ts`, so no credential appears in a command, a file, or a conversation.
- The maintainer manages those logins in the UI. ChatGPT signs in through Pi's `openai` provider and its "Sign in with ChatGPT" method.
- `pnpm check` never calls a real model, so it runs without credentials and costs nothing.

## Pi updates

Pi owns providers, logins, models, and the agent loop. See decision 0012.

- Never add code for a single provider or model. When Pi lacks something or has a bug, wait for a Pi release or report it to Pi.
- Dependabot opens a pull request each week when Pi has a new version. It never merges by itself, because `pnpm check` cannot see changes to sign-in pages, model calls, or Pi's own tools.
- `pnpm check` does fail when Pi changes a text that the Agent place lists. The copies live in `packages/independum/src/pi-texts.ts`. See decision 0034.

To review a Pi update with the maintainer:

1. Read Pi's changelog for every version in the update, and list each change that touches Independum. Update the copy of each text of Pi that `pnpm check` reports as changed, and look for new texts that Pi sends.
2. Run `gh pr update-branch` if the branch is behind `main`. Then check it out and run `pnpm install` and `pnpm check`.
3. Run `pnpm dev`, and confirm that the Logins section of the settings lists every provider and that a real model call still works.
4. Report the findings, and merge with `gh pr merge --squash` only after the maintainer approves.

## Tools

- Independum builds its own tools and registers them with Pi through its hidden extension, which registers them anew when their texts change. The built-in tools of Pi stay off. See decisions 0029 and 0033.
- A tool is planned with the maintainer before it is built: what it does, its description, its parameters, and its life from call to result.
- A tool description holds only what the model needs to know about the tool and the harness to choose the tool and use it. It states facts and gives no rules of conduct.
- What applies to every tool, such as output that is cut, stays out of the descriptions, because the harness says so in the result when it happens.
- Every text that a tool sends to the model is a model text: its description, the descriptions of its parameters, and what its results and notes say under each condition. The user can then edit it and reset it from the day the tool ships. See decision 0033.

## UI

- Every screen works with touch on a phone screen 360 pixels wide.
- The design follows decision 0009. Colors and fonts are tokens in `packages/web/src/theme.css`, and every other stylesheet uses the tokens instead of raw colors.
- A component keeps its styles in a CSS module beside it, for example `top-bar.module.css` beside `top-bar.tsx`.
- An inline `style` only passes values known at run time to the CSS module, as custom properties such as `--logo-url`.
- On the working screen, actions are icons in an `IconButton`, whose tooltip shows the action and its shortcut. Shortcuts live in `packages/web/src/shortcut.ts` and use Ctrl, or Cmd on a Mac, so they work while the user types.
- On the welcome screen, actions are `CommandButton`s, whose bracketed shortcut works on the keyboard too.
- Action labels use sentence case. The top bar of the welcome screen uses lowercase.
- Icons follow `docs/icons.md`. A new icon is drawn to that specification and added to its tables of shapes and motion.
- The page clips with `overflow: clip`, never `overflow: hidden`, because hidden overflow breaks `position: sticky`.
- Text uses `--ink` or `--muted`. `--faint` is too light to read, so it is only for lines and decoration.
- Motion sits inside `@media (prefers-reduced-motion: no-preference)`, so it never plays when the system asks for reduced motion.
- Fonts ship with the app instead of loading from the network, so Independum works offline and makes no outside requests until the user connects a model.
- `pnpm check` enforces the token and motion rules through `scripts/check-styles.ts`.

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
