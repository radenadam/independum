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
- An icon has one color. The only filled orange shape is the send button behind its arrow.

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
| Copy | Two overlapping boxes. |
| Copied | A check. |
| Close | An X. |
| New tab | Four small boxes. |
| Agent | A box with an antenna, two eyes, and two ears. |

A new icon reuses these shapes where it can, so the set stays small and consistent.

## Building icons

- Each icon is an inline SVG with a `viewBox` of `0 0 24 24`, no fill, a `currentColor` stroke 1.75 wide, butt caps, and miter joins.
- An icon is decoration, so it is marked `aria-hidden`. The button that holds it carries the name, and its tooltip shows the name and the shortcut.
- Icons ship with Independum, never from an icon font or the network.
