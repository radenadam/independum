# Visual direction

- Status: accepted, and narrowed by [decision 0016](0016-working-screen.md) and [decision 0017](0017-logins-in-settings.md) to the welcome screen
- Date: 2026-10-24

## Context

The maintainer wants Independum to feel calm, quiet, personal, and new, close to a file editor and a browser blended together. Three directions were prototyped on a design canvas: Folio, Lumen, and Margin. The canvas is at `https://claude.ai/artifact/TUXSGrstTqcXRfoLyD841T` and is private to the maintainer.

## Decision

Independum follows the Margin direction.

- Typography leads. IBM Plex Mono carries the interface, and IBM Plex Sans carries longer prose.
- Color is monochrome with one signal color: `#C2410C` in the light theme and `#FB923C` in the dark theme.
- Navigation lives in the margins, as breadcrumbs and a numbered outline, and switches read as the words "on" and "off".
- The mark is the maintainer's bird logo, traced to SVG. It is one shape that follows the theme's ink color.
- The themes are system, light, and dark.
- Motion is ambient: a slow glow that breathes behind the page, text that types itself in, and the bird rising into its square on the welcome screen. When the system asks for reduced motion, Independum shows none.
- Settings for a project or a session stay out of view until the user opens them from a menu or a side panel.

## Consequences

- The UI keeps borders, boxes, and color to a minimum, so spacing and type do the work.
- The chat screen in the prototype is a placeholder. Decision 0016 designs the working screen, which keeps these colors and fonts but not the Margin layout.
