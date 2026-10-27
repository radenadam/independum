# Steps in a reply

- Status: accepted
- Date: 2026-10-27

## Context

The maintainer asked that thinking, tool calls, and the other steps of the agent each sit in a box of their own, so they read apart from the reply, and that the thinking stay visible. Pi streams thinking as parts of a message, beside its text, but it keeps no time for the thinking.

## Decision

- A message carries its parts in order, each one text or thinking. Tool calls join the parts when tools arrive.
- Each stretch of thinking sits in a box with an outline and no fill, so it reads apart from the reply and from a block of code in it. Thinking that runs across several parts in a row, as an OpenAI model sends it, reads as one box.
- While the model thinks, the box is open, its label says Thinking, and the mark beside it breathes in orange. It shows the latest lines, which fade at the top once they fill it, so a long train of thought does not push the reply down. Once the reply goes on, the box folds to a label such as "Thought for 8.2 s", and a click opens all of it. A box that the user opens or closes stays that way.
- A model can think without showing its thoughts, as an OpenAI model does when it reasons briefly, so its box shows only the time and does not open. Thinking that the provider hid says so.
- The server times each part of the thinking as it streams. After each turn it saves the times in a custom entry, `independum-thinking-times`, which Pi keeps in the chat file and never sends to the model. Chats from before this change show "Thought" without a time.
- Copying a reply leaves out its thinking.

## Consequences

- `ChatMessage` holds `parts` instead of `text`. The stream sends each delta with the place and the type of its part, and sends the whole part when thinking starts and ends.
- The Context place lists the saved times with the rest of the chat.
- Tool calls come with the tools, as steps of the same kind.
