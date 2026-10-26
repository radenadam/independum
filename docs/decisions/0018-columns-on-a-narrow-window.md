# Columns on a narrow window

- Status: accepted
- Date: 2026-10-26

## Context

The working screen of decision 0016 has three columns: the sidebar, the chat, and the side panel. With both side columns open on a window narrower than about 1180 pixels, the chat shrank to about 200 pixels, and the model button ran over the send button.

## Decision

- The sidebar needs 272 pixels, a readable chat 480, and the side panel 420, so all three stay open together only on a window at least 1180 pixels wide.
- On a narrower window, the sidebar and the side panel take turns. Opening one closes the other, and a window that narrows with both open closes the sidebar.
- On a phone, the sidebar and the side panel keep covering the chat, as decision 0016 sets out.
- A name too long for its button, such as a model or a folder, fades out at its end and slides into view on hover, the way a long chat title does.

## Consequences

- The chat never gets narrower than it can show.
- The button that shows a closed sidebar stays in the header, so the sidebar is one click away.
