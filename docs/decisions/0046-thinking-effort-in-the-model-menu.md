# Thinking effort in the model menu

- Status: accepted
- Date: 2026-10-30

## Context

The thinking effort had a button of its own, a dial beside the model, with a list of the levels in its menu. In the first evaluation, the maintainer chose to drop the dial and blend the effort into the model menu, with a slider and a word on what the effort does.

## Decision

- The model menu holds the thinking effort of the current model at its bottom, under its models, where the pointer that opened the menu from below is closest. The list shows five models before it scrolls, wherever the menu opens. Logins live in the settings, so the menu offers to add one only while it has no models. It shows its name, the current level, and a wide bar with a stop for each level that the model offers and a knob.
- The knob moves freely while it is dragged, and its level is chosen once it is let go, so the button of the model and the chat stay still while it moves. The menu stays open.
- Choosing a model keeps the menu open, so its effort can be set right after.
- The button of the model shows the current level beside the name of the model, so it reads without opening the menu.
- A model without thinking levels shows no effort.

## Consequences

- The effort dial, its icon, and its needle are gone from the UI and from `docs/icons.md`.
