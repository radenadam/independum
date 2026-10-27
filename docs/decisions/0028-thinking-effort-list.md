# Thinking effort list

- Status: accepted
- Date: 2026-10-27

## Context

Decision 0023 opened the thinking effort as an upright bar with a stop for each level. The maintainer was still not satisfied with it, and asked to keep the menu simple, as text, for now.

## Decision

- The thinking effort menu is a plain list of the levels that the model offers, by name and from the lowest to the highest, such as Off, Low, Medium, High, and Extra high. It has no heading.
- The current level is orange and checked, as in the model menu. Choosing a level closes the menu.
- The menu is the same list as the model and folder menus, so it looks and moves the same, and it becomes a sheet on a phone. It is as wide as the other small menus, such as the menu of a chat.
- The button keeps the dial without words that [decision 0021](0021-thinking-effort-dial.md) describes, with its tooltip.

## Consequences

- The bar and its component are gone.
- A menu list opened from the keyboard puts the focus on its current choice, unless a field of the menu took it first, so the arrow and Tab keys start there.
