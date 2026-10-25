# Roadmap

This file lists current work, next work, and questions for the maintainer. A change that finishes an item removes it. Lasting choices go in `docs/decisions`.

## Now

- The details panel from decision 0014: the model, the system prompt, Pi's additions, and the exact request sent to the model, read-only.

## Next

- Built-ins in the UI: edit the system prompt and the other built-ins from the details panel. See decisions 0002, 0013, and 0014.
- Tools: reading and editing files and running commands, as built-ins the user can see, approve, and turn off.
- Network access and phone pairing with a QR code. See decision 0005.
- Packaging: build the `independum` command, serve the built UI, generate the favicon from the mark in `packages/web/src/mark.tsx`, and publish to npm. See decision 0010.

## Later

- Desktop app. See decision 0001.

## Open questions

Ask the maintainer when the related work starts, then record each answer as a decision.

- Which places come after chats, such as a reader, a file browser, or a browser, and how does each one look? See decision 0014.
- How do messages look in the chat: Markdown, code, and later tool calls?
- What does the contract for built-ins and add-ons cover: tools, prompt pieces, message injections, UI, settings? Is an add-on code, configuration, or both? See decision 0006.
- When the user edits a built-in and a new Independum version changes the same built-in, what happens to the edit?
- Where do settings other than logins live: per project, per user, or both?
- What triggers a message injection, and what can it see?
- What does memory mean in Independum?
