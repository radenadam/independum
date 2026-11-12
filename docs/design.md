# Design

This page owns current visual meanings. The structural redesign is pending, with no replacement layout accepted. Preserve the useful grammar while judging complete journeys. Margin belongs to welcome and login, and the working screen stays practical with the chat visible. [The standard](standard.md) owns judgment.

## Meaning and hierarchy

Organize around user questions. Identify the object, its owner, its time, and its effect. Distinguish this chat, project, shared profile, installation, and browser. Separate saved, applied, pending, running, and historical facts. Historical inspection must show the captured object and revision before linking to current editing. Explain affected chats, application boundaries, and reversibility. Exact raw and readable views identify the same thing.

Details remain discoverable at every depth. A long editor behind one disclosure is still overload. Creation, inspection, editing, reset, disabling, removal, and recovery form one lifecycle where applicable. Use newcomer language without requiring Pi knowledge. Ask before inventing a new visual or interaction meaning.

| Look | Meaning | Piece |
| --- | --- | --- |
| Bare text | A fact to read | `PlaceNote`, plain markup |
| Small muted heading without a box | A section | `PlaceSection` |
| Filled tile with chevron | Opens or unfolds detail | `PlaceRow`, `Disclosure` |
| One box with row dividers | Related one-line items | `PlaceBox`, `BoxedList` |
| Border without fill | One of many coherent things with parts | Tool card |
| Field or choices | A value to set | `TextField`, `ChoiceGroup` |
| Floating border and shadow | Temporary layer or input | `Popover`, `ModalDialog`, composer |

Use `PlaceFrame` around a place. Sections and lone things never receive cards just for enclosure. Lists never run edge to edge with dividers. Waiting messages use a boxed list because tiles vanish against the composer fill. Attachments and branch alternatives use tiles as [their product pages](product/README.md#area-router) describe.

## Color and type

Colors and fonts are tokens in `packages/web/src/theme.css`. Other stylesheets use tokens. Both themes give each token the same role. Text uses `--ink` or secondary `--muted`. `--faint` draws lines and decoration only. `--signal` and its tint mark selected, current, enabled, summary, caret, error, and active thinking states. Text on filled signal uses `--on-signal`.

Surface tokens have distinct jobs: `--bg` for page, `--sidebar` for side columns, `--surface` for floating layers, `--well` for tiles and boxes, `--raised` for hover and tracks, and `--code` for code. Add both theme values when a new token is needed.

IBM Plex Sans sets working text. IBM Plex Mono sets welcome text, code, paths, ids, and value numbers. Reply text is 16 pixels. Place rows are 14, secondary lines 12 or 13, and section headings 12 with weight 500. Labels use sentence case. The welcome top bar uses lowercase. Fonts ship locally without external requests.

## Controls and edges

Working bars and message actions use `IconButton` with action and shortcut tooltips. Sidebar actions use labeled rows. Menus, settings, and places use labeled rows or text buttons. Welcome actions use `CommandButton` with working bracketed shortcuts. Shortcuts live in `packages/web/src/shortcut.ts`, using Ctrl or Cmd while typing.

Place gutters are 18 pixels and section gaps 22. Menu fields and choice highlights share a width, with text 10 pixels inside. Related edges align. A bar spans its label through its value. `MenuList` puts scrollbars beside choices. Tiles are at least 40 pixels tall. Menus keep their opening position when buttons resize.

Tooltips use `IconButton` or `useTooltip`, never native `title`. Long titles fade with `OneLineTitle` and expose full text on demand. Archived titles wrap on touch. Required information never depends on hover. Phone screens work at 360 pixels without horizontal scrolling.

Use `overflow: clip`, because hidden overflow breaks sticky positioning. Allow the focus ring's 5 pixels beyond controls, or use another visible focus treatment on very small controls.

Styles stay in adjacent CSS modules. Combine imported classes in markup without overriding their properties. Never use cross-file `composes`. A winning variant uses an attribute read by a stronger rule in the owning module.

## Figures and motion

Quantities keep consistent part colors in figures, legends, and rows, with linked highlights. [Decision 0052](decisions/0052-window-figure.md) explains the zoom figure. Icons follow [their specification](icons.md).

Motion is ambient and unnecessary for understanding. CSS motion sits inside `prefers-reduced-motion: no-preference`. JavaScript checks `prefersReducedMotion()`. Text never slides or scrolls by itself.

## Journeys

The seven accepted redesign journeys are connect a model, start work, inspect exactly what the model received, change agent behavior, create a hook, recover from failure, and reproduce the setup headlessly. The maintainer refines expected understanding when each journey approaches. Compare alternatives with identical content, current behavior, long cases, and phone layouts before broad implementation. [Decision 0075](decisions/0075-control-parity-and-newcomer-journeys.md) records the source.
