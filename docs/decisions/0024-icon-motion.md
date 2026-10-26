# Icon motion

- Status: accepted
- Date: 2026-10-27

## Context

The maintainer wanted icons that move when pointed at, such as Settings knobs that slide, a New chat pencil that writes, and a folder that opens, so the interface feels alive. They asked where the line falls, because provider logos are icons too, and moving everything would turn into noise.

## Decision

- An icon moves only when something is about to happen to what it stands for, and the motion acts out that action. Pointing at a button, reaching it with the keyboard, or tapping it plays the motion of its icon once, there and back.
- A lasting state moves an icon for as long as it lasts, such as a folder that stays open while its project is open.
- Provider logos and the raven never move on hover. A logo is the mark of another company and only labels a model, and the raven keeps its one motion, the breath while the model thinks.
- Every motion lasts 450 milliseconds, shares one easing, keeps the size of the icon and the layout around it, and never plays when the system asks for reduced motion.
- `docs/icons.md` lists the motion of each icon, and every new icon gets one.

## Consequences

- One keyframe in `packages/web/src/icon.module.css` drives every motion, and each moving part only sets how far it goes, so all motions feel like one set.
- Some drawings split into more parts, such as the knobs and lines of Settings, so that each part can move on its own. They look the same at rest.
