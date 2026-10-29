# CheckCommand

- Status: accepted
- Date: 2026-10-29

## Context

The model could start a background command and stop it, but it learned what the command printed only from the note at its end, or by reading the output file with Shell. A server that the model starts, for example, needs a way to see when it is ready. The maintainer agreed to a CheckCommand tool, with its description, its parameters, and its results as planned.

## Decision

- CheckCommand takes an optional `id`, `wait`, and `until`. With an id, it returns what the command printed since the last check, and then whether it still runs or how it ended. Without one, it lists the background commands of the chat that run under a heading, one line each, with the id, the command, and how long it has run. In a test, Haiku read a list of one command without the heading as a check of that command.
- The first check returns what the command printed after its Shell call returned.
- `wait` holds the call until the command ends, `until` appears in its output, the time is up, or the reply stops. Without `wait`, the call returns at once. Output since the last check that already holds `until` ends the wait at once, even when the middle of a long output is cut, because the log reads its file for that.
- The output of a check follows the output limits, and its cut note counts lines from the start of the whole output, so the model can find the cut lines in the file.
- A command that ends while a check waits on it needs no note, because the result of the check says how it ended, the same as with StopCommand.
- A check sees only the background commands of its chat. An ended command stays, so the model can still check it.
- Every text of the tool is a model text, and the tool has its own icon, drawn to `docs/icons.md`.

## Consequences

- A running command in the state of the chat carries its id and its command.
- A waiting check shows as a running step without a Stop button, and the user ends the wait by stopping the reply.
- Ended commands stay in memory until Independum restarts, each with at most twice the output limits of text.
