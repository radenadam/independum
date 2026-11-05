# Window figure

- Status: accepted
- Date: 2026-11-05

## Context

The Session place showed how full the context window is as a thin bar of its own, and what fills the request as a second bar of parts, every part in the same gray. A chat starts with a small share of a large window, such as 0.8% of a million tokens, so the first bar stayed almost empty, and the maintainer asked for one figure that shows both, which works when the window is nearly empty and when it is nearly full. Independum first offered three styles of the figure under Appearance: a zoom bar, a fine grid of 1,000 squares, and a coarse grid of 200. After using them, the maintainer kept the zoom bar alone. In a long conversation, the figure also scrolled out of view, while pointing at a request lights up its messages in it.

## Decision

- One figure above the parts of the request shows the context window and what fills it, in the order the model reads it, as a zoom bar. A thin bar is the whole window, with the room that Pi keeps free striped at its end, and a funnel opens the part in use below it to the full width, as a bar of every part. Its caption gives the share and the count of the request, such as 0.7%, 7,279 of 1,000,000 tokens, and its legend gives the tokens of each kind of part, the free room, and the room that Pi keeps free.
- Each kind of part keeps one color in the figure and in its legend: the instructions in the ink color, the tools in the muted color, the summary that Pi sends after a compaction in the signal color, and the other messages in the faint color. Free room is the raised color, and the room that Pi keeps free has a faint outline.
- The room that Pi keeps free is the reserve of its compaction, 16,384 tokens by default, because Pi compacts the chat before a request would reach it. The server sends it with the context, or nothing when compaction is off.
- The bar and its caption stay at the top of the overview while the rest scrolls under them, with a line under them once they stick. A pin beside the caption lets them scroll away, or keeps them in view again, and the browser remembers it. The legend scrolls away, because it says what each color is once, and the rows under it carry the colors too.
- Pointing at a part lights it up in the figure and in the list, and the rest of the figure steps back. A click on the figure opens the part, as its row does. The figure answers only the pointer, because the list under it reaches every part from the keyboard and from a screen reader.

## Consequences

- The Session place no longer has a section of its own for the context window. The message box keeps its meter of the whole context, which counts the last reply too, so it can read a little higher than the figure.
- Decision 0048 points here for the figure.
