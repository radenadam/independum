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

- Draw on a 24 by 24 unit grid. Keep a 2 unit margin, so the drawing fits in the middle 20 by 20 units. Only line ends may reach into the margin, such as the arms of a plus, and the front of an open folder, which tilts past the edge of the closed one.
- The stroke is 1.75 units wide at every size. At 18 pixels it renders at about 1.3 pixels, the stroke width of IBM Plex Sans beside it. The ring of the Context meter is the exception, at 2.75 units, so its level reads at a glance.
- No corner ends in a sharp point. Where two lines meet at less than 90 degrees, the corner is cut, like the corners of a box.
- Show icons at 16 pixels in dense lists and menus, at 18 pixels across the interface, and at 20 pixels on phones.
- Place points on whole or half units, so that lines stay sharp.

## Color and state

- Icons draw in `currentColor`, so they take the text color of their button.
- An icon turns orange, the `--signal` token, while its item is selected or open, such as the open project, the active tab, or an open menu. The drawing stays the same outline.
- An icon has one color. The only filled orange shape is the send button, behind its arrow or its stop box.
- The meters, the Effort dial and the Context ring, are the exceptions. Each one fills in orange up to its level over a `--faint` arc, so the level reads at a glance. Their arcs are round, and the needle of the dial turns to the level, so the ends of the arcs and the tip of the needle may leave the half unit grid.

## Shapes

| Icon | Drawing |
| --- | --- |
| Sidebar | A box with a line near its left edge. |
| Side panel | A box with a line near its right edge. |
| New chat | A box open at its top right corner, with a pencil across the gap. |
| Search | A circle with a handle at 45 degrees. |
| Settings | Two slider lines, each with a round knob. |
| Folder | A box with a tab at its top left. Open, its back keeps the width of the closed box, and its front has cut corners like every box, with its right side slanting forward. |
| Expand | A chevron that points right, and down while open. |
| Menu | A chevron that points down. |
| Add | A plus. |
| Send | An arrow that points up. |
| Latest | An arrow that points down, back to the latest message. |
| Stop | A small box, in the send button while a reply runs. |
| Copy | Two overlapping boxes. |
| Check | A check, for copied text and for the chosen item in a menu. |
| Close | An X. |
| New tab | Four small boxes. |
| Agent | A box with an antenna, two eyes, and two ears. |
| More | Three dots in a row. |
| Edit | A pencil at 45 degrees, to rename a chat or to edit a text, and for the tool that edits a file. |
| Reset | An arrow that points left and curves back under itself, to go back to the built-in text or setting. |
| Pin | A pushpin with its needle down. |
| Export | An arrow that points down into an open tray. |
| Archive | A box under a lid, with a slot. |
| Delete | A bin under its lid, with a handle and two lines. |
| Effort | A dial open at the bottom, with a hub and a needle, which points to the lower left at the lowest thinking level and to the lower right at the highest. |
| Context | A thick ring around a dot, which fills in orange from its top as the context window of the chat fills. |
| Shell | A box with a prompt that points right and a cursor beside it. |
| Stop command | A circle around a small box, on a running command, which stops that command alone. |
| Background | A box in front of another, with an arrow inside it that points to the box behind, on a running command, which moves it to the background. |
| Check command | A circle around three short lines of output, for the tool that checks a background command. |
| Read | A page with its top right corner folded down at 45 degrees, and a lens over its lower right corner, for the tool that reads a file. |
| Write | The page of Read with a plus over its lower right corner, for the tool that writes a file, which is most often a new one. |

A new icon reuses these shapes where it can, so the set stays small and consistent, and it gets a row in the Motion table below.

## Motion

Decision 0024 records why icons move and where the line falls.

- An icon moves only when something is about to happen to what it stands for, and the motion acts out that action.
- A part of an icon moves once, there and back, when its button is pointed at or reached with the keyboard, and a tap on a touch screen plays it too. The search lens moves when its field takes the focus.
- A state moves an icon for as long as it lasts, such as a folder that stays open while its project is open.
- Provider logos and the raven never move on hover. A logo is the mark of another company, and the raven only breathes while the model thinks.
- A motion lasts 450 milliseconds, uses one easing, and never changes the size of the icon or the layout around it. It never plays when the system asks for reduced motion.
- `packages/web/src/icon.module.css` holds the one shared motion, and each moving part only sets how far it goes.

| Icon | Motion |
| --- | --- |
| Sidebar | The line slides toward the left edge. |
| Side panel | The line slides toward the right edge. |
| New chat | The pencil tilts as if it writes. |
| Search | The lens tilts. |
| Settings | The knobs slide toward each other, and their lines stretch and shrink to meet them. |
| Folder | The folder opens while its project or its menu is open. |
| Expand | The chevron nudges the way it points. |
| Menu | The chevron dips. |
| Add | The plus twists a little and back. |
| Send | The arrow rises. |
| Latest | The arrow drops. |
| Stop | The box squeezes. |
| Copy | The front box slides onto the back one. |
| Check | It stays still, because it shows a result, not an action. |
| Close | The X twists a little and back. |
| New tab | The four boxes spread apart. |
| Agent | The eyes blink. |
| More | The dots hop one after another. |
| Edit | The pencil tilts as if it writes. |
| Reset | The head of the arrow nudges back to the left. |
| Pin | The pin presses down. |
| Export | The arrow drops into the tray. |
| Archive | The lid lifts. |
| Delete | The lid lifts and tilts. |
| Effort | The needle revs up. |
| Context | The orange part of the ring turns a little. |
| Shell | The prompt nudges forward, and the cursor stretches as if it types. |
| Stop command | The box squeezes. |
| Background | The arrow nudges toward the box behind. |
| Check command | The lines rise, as if new output comes in. |
| Read | The lens slides left, as if it reads along a line. |
| Write | The plus twists a little and back, around its own center. |

## Building icons

- Each icon is an inline SVG with a `viewBox` of `0 0 24 24`, no fill, a `currentColor` stroke 1.75 wide, butt caps, and miter joins. The `Icon` component in `packages/web/src/icon.tsx` draws them, and a new icon is added there.
- An icon is decoration, so it is marked `aria-hidden`. The button that holds it carries the name, and its tooltip shows the name and the shortcut.
- Icons ship with Independum, never from an icon font or the network.
