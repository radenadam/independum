# Thinking effort in the model menu

- Status: accepted
- Date: 2026-10-30

## Context

The thinking effort had a button of its own, a dial beside the model, with a list of the levels in its menu. In the first evaluation, the maintainer chose to drop the dial and blend the effort into the model menu, with a slider and a word on what the effort does.

## Decision

- The model menu holds the thinking effort of the current model between its search field and its models. It shows its name, an info tip that says what more effort costs, the current level, and a wide bar with a stop for each level that the model offers and a knob.
- The knob moves freely while it is dragged, and its level is chosen once it is let go, so the button of the model and the chat stay still while it moves. The menu stays open.
- The button of the model shows the current level beside the name of the model, so it reads without opening the menu.
- A model without thinking levels shows no effort.

## Consequences

- The effort dial, its icon, and its needle are gone from the UI and from `docs/icons.md`.
