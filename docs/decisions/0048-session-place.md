# Session place

- Status: accepted, and amended by [decision 0052](0052-window-figure.md), which defines the window figure, by [decision 0053](0053-documented-behavior-and-limits.md), which clarifies request storage, detection, and refresh timing, and by [decision 0054](0054-added-facts.md), which adds facts to the request and a cutoff field to the model detail
- Date: 2026-11-04

## Context

The Agent place showed every text at full length, so it grew to thousands of pixels in a panel 420 pixels wide, and almost every heading had a sentence of its own under it. The Context place showed sixteen facts of equal weight above a raw list of entries. In the first evaluation, the maintainer found both noisy, and asked for a design where details come on demand and the user sees at a glance that they do. The maintainer also noted that the prompt is part of the context, because everything that the model reads is, and that everything a chat runs with is bound to one session. The maintainer compared seven options on a clickable page and chose the one that shows what the model reads.

## Decision

- One place, Session, replaces the Agent place and the Context place.
- Its overview holds, from the top:
  - The model with its thinking effort, and the chat, in one box with a line between them, like the logins in the settings. The model opens what Pi knows of it: its provider, its API, and the address that requests go to, its limits, such as the context window and the output of a reply, its prices for a million tokens with the higher prices of a large request, and how long its provider keeps the prompt cache. Then the chat, named for its folder as its project is in the sidebar, with its id, which opens its whole folder, its id, when it started and was last active, and the paths of its files: the chat that Pi saves, the whole output of its tools, and its last request.
  - The use of tokens and cost of the last reply beside that of the whole chat, each row named for what it counts, such as input from the cache. Info tips wait until Independum turns to people who are new to agents, together with docs and other help.
  - The context, which is the last request, under a plain heading. A figure shows the context window and what fills it, as decision 0052 describes. The instructions and the tools follow in one box, each part on one line that opens to what it holds. Inside a key of the request, the parts keep the order Independum sent them in, and separate keys follow the order a model reads them, because the order of keys means nothing to a provider. The provider counts the whole request, and each part shows its share of that count, estimated from its length.
  - The conversation, newest first, on one line that joins its requests. Each request says who did what last, such as You wrote or Shell returned, with when it went out, its model, and its tokens, and opens with what came in, what came out, and its use, and the newest one exactly as it was sent. A change of settings sits on the line as a dot right below the request it led to, so the line reads in time. Each compaction is a row with the color of the summary, which says which requests became the summary and opens the summary that Pi wrote. A request that the model now reads only as a summary is faded, and Pi keeps the newest messages before a compaction as they are, so those stay whole. The newest five requests show, and each older stretch between two compactions waits behind one row that opens it in place. What changed after the last request waits at the top.
  - Pointing at a part, a request, or the latest compaction lights up its parts in the figure and its row.
- The overview follows the rules of the tool cards and the settings. A section is a small heading and its content, and never a box of its own. Items of one line that belong together, such as the model and the chat, or the instructions and the tools, share one box with lines between them, like the logins. What opens is a tile, like the Parameters of a tool, and a request carries its number before its text, where a tool card shows its icon. A card is for one of many things of one kind, such as a tool, so the overview has none. The maintainer chose this in the first evaluation, because the card around the context said that it was one whole with nothing on screen to say why, and a long chat with compactions crowded its list of messages, while the request history waited in a view of its own.
- A part opens its detail, such as the system prompt with its edit actions, or every tool in a card. A narrow panel shows the detail in place of the overview, with a way back to the same spot of the overview. A panel 720 pixels or wider shows it beside the overview, which the user resizes with a handle between them, and a close button closes it, so the overview fills the panel again. The overview and the detail scroll on their own, and a detail opens at its top.
- Opening another chat closes the detail and clears the previous chat's data. A failed load shows why the context or the agent could not load.
- A part that the user changed says so with the word edited, never with an icon, because a pencil reads as the action that edits.
- What runs now, such as a background command or an agent, does not show here. It belongs where the user looks at the chat, such as the sidebar or the message box. Commands keep their own place.
- The parts come from reading the request as data, so they work for every provider without code for one, as `packages/independum/src/summarize-request.ts` describes.

## Consequences

- The glossary gains Session, and Agent and Context point to it.
- The side panel can grow to 960 pixels instead of 640, so the detail fits beside the overview and a wide place, such as a browser later, has room. The chat keeps the readable width that decision 0018 gives it.
- [Decision 0026](0026-context-place.md) is superseded, and the decisions that describe the Agent place or the Context place are amended by this one.
- The tab of the place has an icon of its own: the box of Shell with two lines of text.
