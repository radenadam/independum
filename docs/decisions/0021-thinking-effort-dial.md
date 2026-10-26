# Thinking effort dial

- Status: superseded by [decision 0022](0022-thinking-effort-dial-menu.md)
- Date: 2026-10-26

## Context

Decision 0019 put the thinking effort on a button with rising bars and the name of the level. The button opened a slider with each level named under it and a handle with cut corners. The maintainer found that the bars read as the signal strength of a phone, and that the menu was big and heavy next to the small menus of other chat apps.

## Decision

- The button beside the model button shows only a dial, the Effort icon in `docs/icons.md`. Its needle points at the chosen level, and its arc fills in orange up to it, so the level reads without words. The tooltip names the level, for example "Thinking effort: Medium". The button hides for a model that cannot think.
- The button opens a small menu. Its top shows the chosen level in orange and the model under it. Below them sits a round track with a dot for each level, an orange fill, and a round thumb. The menu has no heading and no note.
- The thumb is a circle, not a square with cut corners. The cut of the raven fits boxes such as buttons, but a knob reads better round, like the knobs of the Settings icon.
- The slider takes the focus when a keyboard is likely, so the arrow keys move it at once.
- The rest of [decision 0019](0019-thinking-effort.md) still holds, such as the levels that come from Pi, the sheet on a phone, and the effort in the Agent place.

## Consequences

- Decision 0019 is superseded, and this record names the parts of it that still hold.
- The Effort dial is the one icon with more than one color, which `docs/icons.md` records.
