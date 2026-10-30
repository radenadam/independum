# Thinking effort in the model menu

- Status: accepted
- Date: 2026-10-30

## Context

The thinking effort had a button of its own, a dial beside the model, with a list of the levels in its menu. In the first evaluation, the maintainer chose to drop the dial and blend the effort into the model menu, with a slider and a word on what the effort does.

## Decision

- The model menu starts with the thinking effort of the current model: its name, the current level, a horizontal slider over the levels that the model offers, the lowest and the highest level at its ends, and one line on what more effort costs.
- Moving the slider changes the level at once, and the menu stays open.
- The button of the model shows the current level beside the name of the model, so it reads without opening the menu.
- A model without thinking levels shows no effort.

## Consequences

- The effort dial, its icon, and its needle are gone from the UI and from `docs/icons.md`.
