# Thinking effort dial menu

- Status: superseded by [decision 0023](0023-thinking-effort-bar.md)
- Date: 2026-10-26

## Context

Decision 0021 drew the Effort icon as a half dial and opened a menu with a round track, which named the model under the level. The maintainer found that the half dial looked small and lost next to the model button, that the track looked the same as the one in the ChatGPT app, and that the model name repeated the model button beside it.

## Decision

- The Effort icon is a dial open at the bottom, like a speedometer, so it fills its square like the other icons. Its needle and its orange arc still show the chosen level.
- The menu is the same dial drawn large. It has a tick for each level that the model offers, the orange arc and the ticks up to the chosen level, a needle, and the name of the level in the open gap under the hub. It shows no model name.
- A drag around the dial or a click on it chooses the nearest level, and a point in the open gap goes to the nearer end. A hidden range input keeps the arrow keys and screen readers working, and it takes the focus when a keyboard is likely.
- The rest of [decision 0021](0021-thinking-effort-dial.md) still holds, such as the button without words and its tooltip.

## Consequences

- Decision 0021 is superseded, and this record names the parts of it that still hold.
- The button and its menu share one drawing, so the button reads as a small copy of the control it opens.
