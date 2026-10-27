# Context place

- Status: accepted
- Date: 2026-10-27

## Context

The Agent place showed both how the agent is set up and the exact request it sent last. The maintainer asked for a place that shows the information about a chat apart from its configuration, the way the Context tab of OpenCode does, with the tokens, the cost, and the raw messages.

## Decision

- The side panel gains the Context place, which a new tab offers beside Agent. The glossary names it Context, because it shows what the model works with, and because the glossary keeps "session" out of the interface.
- The place shows, in two columns: the chat, the counts of messages, the provider and the model, the context window and how much of it is used, the input, output, reasoning, and cache tokens, the tool calls, the total cost, and when the chat was created and last active.
- Under them it lists the entries that Pi saved along the current branch of the chat, each with its role or type, its id, and its time, and each opens to show its exact data. Then comes the exact request that the chat sent last, which moves there from the Agent place.
- Pi counts the tokens, the cost, and the use of the context window. Independum adds the reasoning tokens over the same entries, because Pi leaves them out of its sums.
- The Agent place keeps to configuration: the model, the folder, the prompts, and the tools.

## Consequences

- `GET /api/chat/context` serves the place, and `GET /api/chat/agent` no longer carries the last request.
- The places share a well for code with a copy button and a row that opens, so the raw data looks the same everywhere.
