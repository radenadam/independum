# Commands place

- Status: accepted
- Date: 2026-10-28

## Context

A command of the Shell tool has no timeout unless the model sets one, as decision 0029 describes, so the user needs to see what runs and stop it. The maintainer asked for running commands and the earlier ones in a place of their own, with running commands first, and for a count near the message box that opens it.

## Decision

- The side panel gains the Commands place, which a new tab offers beside Agent and Context. It lists the commands of the open chat: the ones under way on top, and the earlier ones below, newest first.
- A row shows what the command is for, its first line when that adds something, and its status: a timer while it runs, the time it took, Stopped, Timed out, or the exit code in orange. A click opens its step in the chat and brings it into view with a short orange glow.
- A running command has a stop button, in its row and beside the header of its step. It stops that command alone, and the agent goes on with the result "Stopped by the user". The Stop of the message box still ends the whole reply.
- While commands run, the row under the message box says how many, such as "1 command running", with the breathing dot of a running step. A click opens the Commands place.
- The stop button gets its own icon, Stop command, because the Stop icon is a small box made to sit inside the round send button.

## Consequences

- `POST /api/chat/commands/:id/stop` stops one running command, and answers 404 when no running command has that id.
- The places share `PlaceFrame` and `PlaceNote`, and the steps, the rows, and the count share `StatusLabel`, so their layout and their status read the same.
- Commands that run in the background will join the same place.
