# Texts of Pi

- Status: accepted
- Date: 2026-10-29

## Context

The maintainer requires that the user can see every text that Pi writes for the model, under every condition in which Pi writes it. Whether Independum edits these texts is a later decision, as decision 0033 says. An inventory of the code of Pi found texts in several places: a line before the system prompt with a Claude subscription login, a placeholder tool for some Anthropic models, updates in the middle of a chat when the prompt or the tools change, tool results that Pi writes itself, notes about images, and the prompts and messages of compaction. Pi does not export these texts. The inventory also found that a request that Pi sends again only to keep the prompt cache warm replaced the last request in the Context place.

## Decision

- The Agent place lists every text that Pi can send while Independum runs it, grouped by where the model gets it. Each one says when Pi sends it, and opens to its exact text and its slots. The list is read-only.
- The part that Pi adds to the system prompt stays shown above the list, as Pi built it for the open chat.
- A text in the list is marked when the last request of the open chat holds it. The user sees which texts apply now, and Independum does not copy the conditions of Pi into code.
- A text with an optional part becomes one entry for each part, so that a mark is exact.
- Independum keeps a copy of each text, because Pi does not export them. A test checks every copy against the code of the installed Pi, so `pnpm check` fails when an update of Pi changes one.
- Texts for features of Pi that Independum does not use, such as skills, branch summaries, and prompt templates, stay off the list, and the list says that Pi has them.
- A request that Pi sends again only to keep the cache warm no longer replaces the last request in the Context place. The Context place counts these requests instead.

## Consequences

- A review of a Pi update learns from `pnpm check` which listed text changed, and updates the copy in `packages/independum/src/pi-texts.ts`.
- Compaction requests do not pass through the hook that Independum reads, so they do not show in the Context place, and the list says so. How compaction works in Independum stays an open question in the roadmap.
- In tests, the last request of Haiku marked the placeholder tool, and the last request of Luna after an edited tool text marked the update of the tools.
