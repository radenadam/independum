# Roadmap

This file lists current work, next work, and questions for the maintainer. A change that finishes an item removes it. Lasting choices go in `docs/decisions`.

## Now

The maintainer agreed to these, and they come in this order, one small change at a time.

- A sidebar and a side panel that resize: drag the edge, double-click it to reset, or use the arrow keys on it, and the width stays on that device.
- Smart copy: a selection copies as Markdown and as formatted text, a table pastes into a spreadsheet as a table, and the copy button offers Markdown or plain text.
- Math in replies with KaTeX, with its fonts shipped in the app so it works offline.
- A way back to the latest message when the user scrolls up during a reply.
- A draft for each chat, kept while the user switches chats.
- Export of a chat as Markdown.
- The Context place in the side panel. It shows the chat, its model, how full the context window is, the tokens, the cost, the times, the raw messages, and the last request, which moves there from the Agent place. A context meter icon in the message box fills as the context does and opens the place.
- The agent loop in the chat: thinking, tool calls, and the other steps of a reply each sit in a box of their own, set apart from the answer, and thinking folds away.
- Tools: reading and editing files and running commands, as built-ins the user can see, approve, and turn off.

## Next

- Branching: edit and resend a prompt, retry a reply with the same or another model or effort, and fork a chat. Each makes a branch, which Pi already keeps, and a switcher under a message moves between branches. The look needs a decision first.
- Attachments: paste or drop images and files into a message.
- Queue and steer: while a reply runs, queue a message for after it, or steer the reply with it.
- Built-ins in the UI: edit the system prompt and the other built-ins from the Agent place. See decisions 0002, 0013, and 0016.
- Network access and phone pairing with a QR code. See decision 0005.
- Packaging: build the `independum` command, serve the built UI, generate the favicon from the mark in `packages/web/src/mark.tsx`, and publish to npm. See decision 0010.

## Later

- Desktop app. See decision 0001.

## Open questions

Ask the maintainer when the related work starts, then record each answer as a decision.

- Which places come after Agent in the side panel, such as a terminal, a browser, files, or forking a chat, and how does each one look? See decision 0016.
- How does the user open a folder that is not a project yet?
- What does the contract for built-ins and add-ons cover: tools, prompt pieces, message injections, UI, settings? Is an add-on code, configuration, or both? See decision 0006.
- When the user edits a built-in and a new Independum version changes the same built-in, what happens to the edit?
- Where do settings other than logins live: per project, per user, or both?
- What triggers a message injection, and what can it see?
- What does memory mean in Independum?
