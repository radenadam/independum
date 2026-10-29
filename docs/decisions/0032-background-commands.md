# Background commands

- Status: accepted, and amended by [decision 0038](0038-background-start-check.md), which returns a background call after two seconds
- Date: 2026-10-28

## Context

A command of the Shell tool blocks the reply until it ends, so a server or a watcher would hold the agent forever. The maintainer wanted such commands to run in the background, to see them in the Commands place, and to let the model stop them with a tool of its own. Asked how the model should learn that a background command ended while the agent is idle, the maintainer chose to wake the agent.

## Decision

- Shell takes an optional `background`. The call returns at once with the id of the command, a number from 1, and the path of the file that receives its output, and the command runs on. The parameter says so in facts, and that a new turn starts when the command ends.
- StopCommand is a tool of its own. It takes the `id` of a background command and stops it with every program that it started, and its result says how the command ended. A tool of its own keeps one job per tool, and keeps `command` required in Shell.
- When a background command ends, Independum adds a note to its chat: how it ended, where its whole output is, and its last 20 lines. The note wakes the agent, which starts a turn by itself, or reaches the agent at the next step when a reply is under way. The note shows in the chat as a step that holds the exact text that the model read.
- A command that StopCommand ends gets no note, because the result of StopCommand already says how it ended. A command that the user stops gets a note that says so.
- A background command keeps running while the user opens other chats. When it ends, a chat that is not open keeps the note for its next turn. Every background command ends when Independum quits.
- In the chat, the step of a background command shows a timer and a stop button while the command runs, then how it ended. The Commands place lists it under Running, and the count under the message box includes it, also after the reply ends.

## Consequences

- Pi delivers the note as a custom message, which the model reads as a message in the conversation, and saves it in the chat.
- This answers one case of the open question about message injections: the end of a background command adds a note that the user can see. Other cases stay open in the roadmap.
- Models choose for themselves whether to use `background`. In a test, Haiku used it and StopCommand, and Luna managed the process inside one command instead.
