# Roadmap

This file lists current work, next work, and questions for the maintainer. A change that finishes an item removes it. Lasting choices go in `docs/decisions`.

## Now

The working screen from decision 0016, built in steps:

- The model list as a sheet from the bottom on a phone.

## Next

- Built-ins in the UI: edit the system prompt and the other built-ins from the Agent place. See decisions 0002, 0013, and 0016.
- Tools: reading and editing files and running commands, as built-ins the user can see, approve, and turn off.
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
