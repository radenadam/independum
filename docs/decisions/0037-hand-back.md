# Hand-back

- Status: accepted
- Date: 2026-10-29

## Context

A command of the Shell tool holds the reply until it ends, so a server started without `background`, or a command that waits for input, holds the agent until the user stops it. Every harness that the research looked at hands control back after a while instead of killing the command. The maintainer agreed to that, with a button that does the same by hand. The maintainer also left the choice of a parameter for the working folder to the agent.

## Decision

- A command that still runs after a time that the user chooses goes on as a background command. The call returns with the output so far, the id of the command, and the file that receives its output, and the end of the command wakes the agent with a note, as decision 0032 describes. The process is the same, so nothing restarts and nothing is lost.
- The time is two minutes unless the user picks another on the Shell card: never, one, two, five, or ten minutes. The description of Shell says it in one model text, which goes away when the user picks never.
- A running command of the reply has a button beside Stop that moves it to the background at once, in its step and in the Commands place. Its result says that the user moved it.
- A timeout that the model set still stops the command after it goes on in the background, and stopping the reply no longer stops it then.
- Shell takes an optional `workdir`, a folder in the project or an absolute path, because models trained to set the folder per call can then do so. A folder that does not exist fails with a model text that names it.
- The new icon for moving a command to the background follows `docs/icons.md`.

## Consequences

- An output log hands its file and its listener to the background commands, which take over the run of a command that started in a reply.
- In a test through the app, Haiku saw a command go on in the background after 60 seconds, said that a note would follow, and reported the result when the note woke it.
