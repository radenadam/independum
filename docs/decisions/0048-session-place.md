# Session place

- Status: accepted
- Date: 2026-11-04

## Context

The Agent place showed every text at full length, so it grew to thousands of pixels in a panel 420 pixels wide, and almost every heading had a sentence of its own under it. The Context place showed sixteen facts of equal weight above a raw list of entries. In the first evaluation, the maintainer found both noisy, and asked for a design where details come on demand and the user sees at a glance that they do. The maintainer also noted that the prompt is part of the context, because everything that the model reads is, and that everything a chat runs with is bound to one session. The maintainer compared seven options on a clickable page and chose the one that shows what the model reads.

## Decision

- One place, Session, replaces the Agent place and the Context place.
- Its overview holds, from the top:
  - The model with its thinking effort, the folder, and the chat id, read from the left.
  - The use of tokens and cost of the last reply beside that of the whole chat, each row named for what it counts, such as input from the cache. Info tips wait until Independum turns to people who are new to agents, together with docs and other help.
  - How full the context window is.
  - The context, which is the last request, in groups in the order a model reads them: its instructions, its tools, and its messages. Inside a key of the request, the parts keep the order Independum sent them in, and separate keys follow the order a model reads them, because the order of keys means nothing to a provider. Each part names who put it there in words: You, Model, Tool, Independum, Pi, or Other. A bar above the list shows what fills the request, every part in the same gray, and pointing at a part lights it up in the bar and in the list. The provider counts the whole request, and each part shows its share of that count, estimated from its length.
  - The request history, newest first, on one line that joins the requests, with each change of settings as a dot right above the request it led to. It opens each request with what came in, what came out, and its use, and the newest one exactly as it was sent.
  - The model, which opens what Pi knows of it: its provider, its API, and the address that requests go to, its limits, such as the context window and the output of a reply, its prices for a million tokens with the higher prices of a large request, and how long its provider keeps the prompt cache.
  - The chat, which opens when it started and was last active, and the paths of its files: the chat that Pi saves, the whole output of its tools, and its last request.
- The overview is built from the pieces of the tool cards. The context is its only card, so the border wraps exactly what the model reads, and the facts about the session sit around it in plain sections. Each part is a tile, like the Parameters of a tool, and a message carries its number before its text, where a tool card shows its icon. The maintainer chose this from four styles on a clickable page, because the tool cards felt proportionate in their spacing, type, and separation.
- A part opens its detail, such as the system prompt with its edit actions, or every tool in a card. A narrow panel shows the detail in place of the overview, with a way back to the same spot of the overview. A panel 720 pixels or wider shows it beside the overview, which the user resizes with a handle between them, and a close button closes it, so the overview fills the panel again. The overview and the detail scroll on their own, and a detail opens at its top.
- A part that the user changed says so with the word edited, never with an icon, because a pencil reads as the action that edits.
- What runs now, such as a background command or an agent, does not show here. It belongs where the user looks at the chat, such as the sidebar or the message box. Commands keep their own place.
- The parts come from reading the request as data, so they work for every provider without code for one, as `packages/independum/src/summarize-request.ts` describes.

## Consequences

- The glossary gains Session, and Agent and Context point to it.
- The side panel can grow to 960 pixels instead of 640, so the detail fits beside the overview and a wide place, such as a browser later, has room. The chat keeps the readable width that decision 0018 gives it.
- [Decision 0026](0026-context-place.md) is superseded, and the decisions that describe the Agent place or the Context place are amended by this one.
- The tab of the place has an icon of its own: the box of Shell with two lines of text.
