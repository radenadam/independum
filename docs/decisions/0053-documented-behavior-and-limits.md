# Documented behavior and limits

- Status: accepted, and amended by [decision 0055](0055-model-settings-and-compaction.md), which adds model and compaction controls and refreshes context when settings or compaction change, and by [decision 0058](0058-address-chats-by-id.md), which gives each client its own open chat, extended by [decision 0062](0062-project-resources-and-context-controls.md) for explicit context preparation and captured request revisions
- Date: 2026-11-05

## Context

A documentation audit finds old decisions without links to later changes, rules that omit intended exceptions, and behavior that an agent can learn only from code. Decision bodies remain a record of their time, so their status lines link later decisions instead of rewriting the old text. Implementation defects remain defects and do not become exceptions to the rules.

## Decision

- Today, Independum exposes controls for the system prompt, tools, settings, and model texts that it owns. The texts that Pi adds are visible and read-only, as [decision 0033](0033-model-texts.md) allows, and Independum sends the request of Pi as Pi builds it. The 0.5 checkpoint lets the user turn off what Pi adds, without code for one provider.
- API requests require the access token and an allowed host. A supplied origin must match the server, but an absent origin is allowed.
- Chats run independently, as [decision 0051](0051-chats-run-on-their-own.md) requires, but the open chat is shared by all browsers connected to one server. Choosing another chat changes that selection for every browser. Startup reopens the most recent chat in the launch folder.
- Drafts belong to each chat in browser local storage and are saved as the user types. Opening another chat restores the draft of that chat. An empty draft removes its saved value.
- Long titles fade at their end and show their full text in a tooltip through `OneLineTitle`, as `AGENTS.md` requires. They no longer slide on hover.
- The chat menu offers Export as Markdown. It exports prompts and reply text, with the model named in each reply heading, and includes reply errors. It leaves out thoughts, tool calls, and notes.
- Copy reply supplies formatted HTML and Markdown text. Its menu also offers Markdown and plain text. Copying a selection supplies HTML and Markdown without controls and times, while a selection inside a code block keeps the browser's native copy behavior. Reply copying still leaves out thinking, as [decision 0027](0027-steps-in-a-reply.md) requires.
- The Session history uses the request, turn, and reply meanings in `docs/glossary.md`.
- Only the last raw request of each chat is saved, in the `requests` folder under the Independum data folder. Saving is asynchronous, and a write failure stays silent. Reading missing or invalid saved data returns `null`, so request inspection is unavailable until another request is captured.
- Request parts are detected by text matching without provider-specific code. Unmatched text shorter than 40 characters is ignored, and sections without a known source are omitted. This view is an interpretation of the request, and the raw request remains available for inspection.
- Session and context meter data load when the chat becomes known and refresh when the chat id, model id, or reply state changes. They do not refresh for each model request, effort change, or compaction event on its own.
- Edit reports at most 20 matching places and five near-match differences, followed by the count left out. These bounds limit the explanation, and matching stays exact.
- Write retains a text diff for a replaced file. This can support later text restoration, but it does not retain the original bytes of a binary file, so replacing binary content cannot promise restoration from that diff.
- The common contract for built-ins and add-ons remains planned in [decision 0006](0006-built-ins-and-add-ons-share-one-contract.md). Current tool registration does not provide shipped add-on support, and Pi's discovered extensions stay disabled. The contract remains an open question in `docs/roadmap.md`.
- Intended naming, stylesheet comment, color, and reduced motion exceptions live beside their rules in `AGENTS.md`. Shape, size, grid, and timing exceptions live in `docs/icons.md`.

## Consequences

- Earlier records link the decisions that change them, so their historical bodies do not serve as an unqualified current specification.
- The timing of the `packages/core` extraction remains an open question in `docs/roadmap.md`, because the implementation stays in `packages/independum` and no decision cancels the plan.
- The audit's accidental code violations still need code changes. This documentation change does not relax their rules.
