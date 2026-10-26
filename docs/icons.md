# Icons

This is the specification for every icon in Independum. Follow it for each new icon, so that all icons read as one set. Decision 0015 records why the set looks this way.

## Style

- Icons are outlines. They are never filled, except for a dot no wider than 2 units.
- Lines end square, with butt caps, and corners meet sharp, with miter joins.
- The corners of boxes are cut at 45 degrees, like the straight cuts of the raven in Independum's mark. A cut is 2 units, or 1 unit on a shape smaller than 10 units.
- Circles and arcs stay round. A search lens is a circle, never an octagon.
- Straight lines run horizontally, vertically, or at 45 degrees. Another angle appears only where a familiar shape needs it, such as the tip of a pencil.
- An icon has at most four separate shapes, so it stays clear at 16 pixels.

## Grid and size

- Draw on a 24 by 24 unit grid. Keep a 2 unit margin, so the drawing fits in the middle 20 by 20 units. Only line ends may reach into the margin, such as the arms of a plus.
- The stroke is 1.75 units wide at every size. At 18 pixels it renders at about 1.3 pixels, the stroke width of IBM Plex Sans beside it.
- Show icons at 16 pixels in dense lists and menus, at 18 pixels across the interface, and at 20 pixels on phones.
- Place points on whole or half units, so that lines stay sharp.

## Color and state

- Icons draw in `currentColor`, so they take the text color of their button.
- An icon turns orange, the `--signal` token, while its item is selected or open, such as the open project, the active tab, or an open menu. The drawing stays the same outline.
- An icon has one color. The only filled orange shape is the send button, behind its arrow or its stop box.
- The Effort dial is the one exception. Its arc fills in orange up to the chosen level over a `--faint` arc, so the level reads at a glance. Its arc is round, and its needle turns to the level, so the ends of the arc and the tip of the needle may leave the half unit grid.

## Shapes

| Icon | Drawing |
| --- | --- |
| Sidebar | A box with a line near its left edge. |
| Side panel | A box with a line near its right edge. |
| New chat | A box open at its top right corner, with a pencil across the gap. |
| Search | A circle with a handle at 45 degrees. |
| Settings | Two slider lines, each with a round knob. |
| Folder | A box with a tab at its top left. |
| Expand | A chevron that points right, and down while open. |
| Menu | A chevron that points down. |
| Add | A plus. |
| Send | An arrow that points up. |
| Stop | A small box, in the send button while a reply runs. |
| Copy | Two overlapping boxes. |
| Check | A check, for copied text and for the chosen item in a menu. |
| Close | An X. |
| New tab | Four small boxes. |
| Agent | A box with an antenna, two eyes, and two ears. |
| More | Three dots in a row. |
| Rename | A pencil at 45 degrees. |
| Pin | A pushpin with its needle down. |
| Archive | A box under a lid, with a slot. |
| Delete | A bin under its lid, with a handle and two lines. |
| Effort | A dial open at the bottom, with a hub and a needle, which points to the lower left at the lowest thinking level and to the lower right at the highest. |

A new icon reuses these shapes where it can, so the set stays small and consistent.

## Building icons

- Each icon is an inline SVG with a `viewBox` of `0 0 24 24`, no fill, a `currentColor` stroke 1.75 wide, butt caps, and miter joins. The `Icon` component in `packages/web/src/icon.tsx` draws them, and a new icon is added there.
- An icon is decoration, so it is marked `aria-hidden`. The button that holds it carries the name, and its tooltip shows the name and the shortcut.
- Icons ship with Independum, never from an icon font or the network.
