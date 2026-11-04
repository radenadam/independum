# Turning raven

- Status: accepted
- Date: 2026-11-04

## Context

The raven beside thinking breathed in orange while the model thought, and it never moved on hover, as decision 0024 set. In the first evaluation, the maintainer asked for the raven to come alive: to turn toward the user while the model thinks, and to face forward when its row is pointed at. The maintainer drew the raven facing forward and slightly turned, and compared the motions on a page before choosing.

## Decision

- The mark has three faces in the same square: the bird in profile, as the logo shows it, slightly turned toward the user, and facing forward. The turned faces stand on the neck and the wing of the profile, so only the head turns.
- While the model thinks, the head tilts toward the user and back on a loop, in cuts between the faces like the head of a bird, and the mark no longer breathes.
- Pointing at the row of a thought, or reaching it with the keyboard, turns the head forward through the tilt, and it holds there until the pointer leaves. It does so while the model thinks and after, so the raven answers the same way on every row.
- When the system asks for reduced motion, the raven stays in profile.

## Consequences

- `docs/icons.md` describes the motion of the raven.
- Decision 0024 and decision 0027 are amended by this one.
- The logo in the sidebar and the top bar stays in profile and still.
