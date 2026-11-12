# Icons

This owns icon geometry and motion. [Decision 0015](decisions/0015-icon-style.md) records the raven-cut family, [0024](decisions/0024-icon-motion.md) its motion, and [0049](decisions/0049-turning-raven.md) the thinking raven.

## Geometry

- Use outlines without fill, except dots no wider than 2 units. Lines have butt caps and miter joins.
- Draw on a 24 by 24 grid within the middle 20 by 20 units. Only line ends and the open folder front may pass its 2 unit margin. The front may pass the grid.
- Stroke width is 1.75 at every size, about 1.3 pixels at 18 pixels. The Context ring uses 2.75 for a readable level.
- Box corners have 45 degree cuts of 2 units, or 1 on shapes smaller than 10. No corner ends in a sharp point. Cut corners meeting below 90 degrees. Cut every corner of slanted boxes, including wide corners.
- Circles and arcs stay round. Straight lines are horizontal, vertical, or 45 degrees unless recognition requires another angle, such as a pencil tip.
- Use at most four shapes for clarity at 16 pixels. Settings has six for independent knobs and lines. Stop command has five for gaps at its strike.
- Place points on whole or half units. Read's eye and Check command's lens have fractional radii to fit. The round Context arc can leave this grid.
- File tools reuse Read's page with a lower-right mark. Command tools reuse Shell's box. A second state preserves the first state's whole shape and only adds, so it never shrinks.
- Sizes are 16 pixels in dense lists, 18 ordinarily, and 20 on phones. `IconButton` keeps regular, small, and tiny icons at 18, 16, and 14 because its control supplies the touch target.

## Color and implementation

Use one `currentColor` stroke. Selected or open items use `--signal` without changing outlines. The send button has a filled signal background behind its arrow or stop box. Context is exceptional, with signal level over a faint ring.

Draw inline SVG in `packages/web/src/icon.tsx` with `viewBox="0 0 24 24"`, no fill, and the geometry above. Decorative SVG has `aria-hidden`. Its button carries the accessible name and tooltip with shortcut. Icons ship locally without icon fonts or external requests.

Before shipping, compare familiar icons, inspect on the large grid and at 16 and 18 pixels in both themes. Preserve recognition cues, including the open folder's slanted front. Add each icon's drawing and motion to the table.

## Motion

Motion acts out an imminent action. A part moves once there and back on hover or keyboard focus, and touch taps play it too. Search moves when its field focuses. State motion lasts with the state, including an open folder or repeating Replying dots. Provider logos never animate.

Ordinary motion lasts 450 milliseconds with one easing and no layout or size change. `packages/web/src/icon.module.css` holds the shared motion and parts supply distances. State transitions use their own easing. Context meter and raven color take 200 milliseconds, and folder transitions 180. Replying repeats at half speed. Reduced motion disables all motion through [design's guard](design.md#figures-and-motion).

The thinking raven tilts toward the user and returns on a 2.4 second loop. Hover or focus makes it face forward, with a 180 millisecond glance and its front appearing after 90. It never breathes. `thinking-mark.module.css` owns its cuts between faces.

## Drawings and actions

| Icon | Drawing | Motion |
| --- | --- | --- |
| Sidebar | Box with left inset line | Line slides left. |
| Side panel | Box with right inset line | Line slides right. |
| New chat | Box open at top right with pencil | Pencil writes. |
| Search | Circle with 45 degree handle | Lens swings around fixed handle end. |
| Settings | Two slider lines and round knobs | Knobs approach and lines stretch. |
| Folder | Tabbed box. Open back keeps its closed size. Front hinges forward from bottom, with slanted sides and top beyond the back's right. Bottom joins 2 units inside the back's left so shapes do not merge. | Opens with project or menu. |
| Expand | Right chevron, down when open | Nudges toward its direction. |
| Menu | Down chevron | Dips. |
| Add | Plus | Slight twist and return. |
| Send | Up arrow | Rises. |
| Latest | Down arrow | Drops. |
| Stop | Small box in send button | Squeezes. |
| Copy | Overlapping boxes | Front slides onto back. |
| Check | Check mark | Still because it reports a result. |
| Close | X | Slight twist and return. |
| New tab | Four boxes | Spreads apart. |
| Agent | Box, antenna, eyes, ears | Eyes blink. |
| More | Three dots | Hop in sequence. |
| Replying | More replaces Latest during reply | Repeats hops at half speed. |
| Edit | 45 degree pencil | Tilts as if writing. |
| Edit file | Read page with lower-right pencil | Pencil nudges upward and right. |
| Reset | Left arrow curving back underneath | Head nudges left. |
| Pin | Downward pushpin | Presses down. |
| Export | Down arrow into open tray | Drops into tray. |
| Archive | Box, lid, slot | Lid lifts. |
| Delete | Bin, lid, handle, two lines | Lid lifts and tilts. |
| Context | Thick ring and dot, level fills from top | Signal arc turns slightly. |
| Compact | Horizontal lines with inward chevrons | Squeezes toward middle. |
| Shell | Box, right-pointing prompt, cursor | Prompt and cursor nod around open side and right end. |
| Stop command | Shell struck from lower left to upper right, with gaps over box and cursor | Strike retracts upward then strikes down. |
| Background | Front box and arrow pointing to back box | Arrow nudges back. |
| Check command | Shell without cursor, open lower right for lens | Lens swings around fixed handle end. |
| Read | Page with top-right fold and lower-right eye | Eye blinks. |
| Session | Shell box with long and short text lines | Short line grows and returns. |
| Steps | Three stacked boxes | Upper two separate and settle. |
| Write | Read page with lower-right plus | Plus twists slightly around its center. |
