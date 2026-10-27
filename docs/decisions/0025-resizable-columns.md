# Resizable columns

- Status: accepted
- Date: 2026-10-27

## Context

Decision 0018 gave the sidebar 272 pixels and the side panel 420, and let all three columns stay open together only on a window at least 1180 pixels wide. The maintainer asked for a sidebar and a side panel that the user can resize, so those widths no longer stay fixed.

## Decision

- A handle on the inner edge of the sidebar and of the side panel resizes it. A drag moves the edge, the arrow keys move it 16 pixels, Home and End take it to its narrowest and widest, and a double click sets it back to its initial width.
- The sidebar starts at 272 pixels and stays between 220 and 400. The side panel starts at 420 pixels and stays between 340 and 640.
- A column never grows into the 480 pixels that a readable chat needs.
- Each width stays on the device, in the browser, because a phone and a computer need different widths.
- The columns take turns on a window that cannot hold both at their widths and a readable chat, instead of on any window under 1180 pixels. The rest of [decision 0018](0018-columns-on-a-narrow-window.md) still holds.
- A phone shows the columns over the chat at a set width, so they do not resize there.

## Consequences

- Decision 0018 is superseded, and this record names the parts of it that still hold.
- `packages/web/src/column-width.ts` holds the widths and the room for the chat in one place.
