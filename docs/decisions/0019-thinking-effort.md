# Thinking effort

- Status: superseded by [decision 0021](0021-thinking-effort-dial.md)
- Date: 2026-10-26

## Context

Models that think before they answer let the user choose how long they think. Pi lists the levels each model supports, such as off, low, medium, high, and more, and keeps the chosen level with the chat. Independum had no way to choose one.

## Decision

- A button beside the model button shows the thinking effort of the chat, with a small meter of rising bars and the name of the level. It hides for a model that cannot think.
- The button opens a slider over the levels that the model offers, with each level named below it. The handle is a square with its corners cut, like the raven, and the track fills in orange up to it. The slider works with a pointer, touch, and the arrow keys, and on a phone it opens as a sheet like the other menus.
- The levels come from Pi, so a model with more or fewer levels gets a slider with more or fewer stops. A level that Independum has no name for shows its own name with a capital letter.
- The Agent place shows the thinking effort under the model.

## Consequences

- The thinking effort is part of each chat, because Pi saves it there.
- The exact request in the Agent place shows how Pi passes the effort to the provider.
