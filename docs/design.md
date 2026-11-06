# Design

This page says how Independum looks and what each look means, so that a person or an agent can read the screen and add to it without guessing. Decision 0009 sets the direction. The tokens live in `packages/web/src/theme.css`, and `pnpm check` keeps every stylesheet on them.

## One look, one meaning

Each surface below means one thing everywhere. When something new needs a look, pick the row whose meaning fits. When no row fits, ask the maintainer before inventing a new look.

| Look | Meaning | Examples | Piece |
| --- | --- | --- | --- |
| Bare text on the page | A fact to read | A reply, the Use table, a note under a heading | `PlaceNote`, plain markup |
| Small gray heading over content, with no box | A section of a place | Use, Context, Output limit | `PlaceSection` |
| Tile: a filled box with a chevron | Opens a detail, or unfolds in place | Parameters, a request of the conversation, Show requests 1 to 3 | `PlaceRow`, `Disclosure` |
| One box with lines between its rows | Items of one line that belong together | The model and the chat, the instructions and tools, the logins | `PlaceBox`, `BoxedList` |
| Card: a border with no fill | One of many things of one kind that each hold parts | Each tool in the Tools detail | `card` in `tool-card.module.css` |
| Field: a box to type in or a row of choices | A value that the user sets | Output limit, Theme, the search of a menu | `TextField`, `ChoiceGroup` |
| Floating layer: a surface with a border and a shadow | Sits above the page for a moment or holds input | Menus, dialogs, the message box | `Popover`, `ModalDialog` |
| The signal color or its soft tint | Chosen, current, or on | The open chat, the current row, the pressed choice, a switch that is on | `--signal`, `--signal-soft` |

A section is never a box of its own. A card is never used for one thing alone, because its border only answers where one of many ends and the next begins. A list never runs from edge to edge with lines between its rows, so rows that belong together sit in one box.

The message box keeps waiting messages in one `BoxedList` above its field. Each row opens its details as one button with the chevron of a tile, and its remove button sits beside it until handoff. A tile would vanish there, because the floating layer and a tile share one fill in the light theme. Its delivery menu opens from Choose queue or steer and uses `ChoiceGroup`, and held delivery has a Resume sending `TextButton` beside the list heading, so it never looks like Send. Send and Stop remain separate during a reply. [Decision 0064](decisions/0064-queue-and-steer.md) defines the boundaries and keys.

Attachments use filled `PlaceRow` tiles with their delivery form and an original image thumbnail where supported. Remove sits beside each tile. Its detail uses `ModalDialog`, with original facts and prepared model input in `PlaceSection` sections. The Attachment settings and shared Notes envelope open from Session and reuse the profile editors. [Decision 0068](decisions/0068-message-attachments.md) defines their behavior.

## Color

- Text uses `--ink`, or `--muted` for what is secondary. `--faint` is too light to read, so it draws only lines and decoration.
- `--signal` is the one accent, orange. It marks what is chosen, current, or on, the summary of a compaction, and the caret. Nothing else is orange.
- Surfaces have one job each:
  - `--bg` is the page.
  - `--sidebar` is the sidebar and the side panel.
  - `--surface` is a floating layer.
  - `--well` fills a tile and a box inside a place, lighter than the page in the light theme and darker in the dark one.
  - `--raised` fills what the pointer rests on, and a track.
  - `--code` fills a block of code.
- The light and the dark theme use the same tokens. A new color is a new token with both values, never a raw color in a stylesheet.

## Type

- IBM Plex Sans carries the working screen: chats, places, menus, and settings. IBM Plex Mono is the voice of the welcome screen, and it sets code, paths, ids, and numbers that are read as values, such as the number of a request.
- A reply reads at 16 pixels. A row of a place reads at 14, its second line and a note at 12 or 13, and the heading of a section at 12, weight 500, in `--muted`.
- Labels use sentence case, and an action reads as what it does, such as Show requests 1 to 3.

## Space and edges

- A place keeps 18 pixels between its edge and its content, which `PlaceFrame` holds as `--place-gutter`, and 22 pixels between its sections.
- Boxes that sit together share one pair of edges, and their text starts 10 pixels inside them, so every edge and every line of text lines up. A bar belongs to its label, such as the thinking effort, so it spans the line of the text.
- A scrollbar sits beside what it scrolls, in the padding, and never narrows it.
- A tile is at least 40 pixels tall, so a finger can press it.

## Figures

- A figure shows a quantity that changes, such as the context window. Each kind of part keeps one color in the figure, in its legend, and in the swatch of its row. Decision 0052 describes the window figure.
- Pointing at a part lights it up in the figure and in its row, and the rest steps back.

## Motion

- Motion is ambient and never needed to understand the screen. It plays only inside `@media (prefers-reduced-motion: no-preference)`, or after a check of the same setting in code.
- Text never slides or scrolls by itself. A title that does not fit fades at its end and shows whole in a tooltip.
- `docs/icons.md` sets how icons are drawn and how they move.

## Phone

- Every screen works with touch on a screen 360 pixels wide.
- Nothing that the user needs may depend on hover, because a phone has none. A tooltip only repeats what the screen already shows or names an action whose icon is common.
- Archived chat titles wrap on touch screens so titles with the same beginning remain distinct.
- Settings sections wrap onto more rows when they need room. Every section stays reachable without horizontal scrolling.
