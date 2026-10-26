# Icon style

- Status: accepted
- Date: 2026-10-26

## Context

The working screen uses small icons with tooltips in place of text commands, and later changes will add many more icons. The set needs one style that every change follows. Common icon sets, such as the one in the first mockup, use round ends and round corners, which feel friendly but generic. Independum's mark is a raven cut out of a square with straight, angled edges, and IBM Plex has square ends and angled cuts of its own.

## Decision

- Icons follow the raven cut. They are outlines with square ends, sharp joins, and box corners cut at 45 degrees.
- The stroke is 1.75 units on a 24 unit grid, which matches the stroke of IBM Plex Sans at the usual size of 18 pixels.
- Circles stay round, so familiar shapes such as a search lens stay familiar.
- A selected or open item shows its icon in orange, with the same drawing.
- `docs/icons.md` holds the full specification.

## Consequences

- Independum draws its own icons instead of using an icon library, because libraries use round ends and corners. Each new icon takes a little drawing work.
- The settings icon is a pair of sliders instead of a gear, because the fine teeth of a gear do not survive square ends at 18 pixels.
