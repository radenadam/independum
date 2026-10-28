# Roadmap

This file lists current work, next work, and questions for the maintainer. A change that finishes an item removes it. Lasting choices go in `docs/decisions`.

## Now

The maintainer agreed to these, and they come in this order, one small change at a time.

- The next steps of Shell, as decision 0029 describes. First a Commands place in the side panel, with running commands on top and the earlier commands of the chat below, a count of running commands beside the message box that opens it, and a stop for each command. Then settings for the shell and the output limits, with switches for tools in the Agent place. Then commands that run in the background.
- Read, Write, and Edit, each planned with the maintainer before it is built.

## Next

- More tools, each planned the same way, such as web search, web fetch, an agent tool, and a browser.
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

- How do permissions and sandboxing work for commands and the other tools? Study the options once the tools are done. See decision 0029.
- Which places come after Agent and Context in the side panel, such as a terminal, a browser, files, or forking a chat, and how does each one look? See decisions 0016 and 0026.
- How does the user open a folder that is not a project yet?
- What does the contract for built-ins and add-ons cover: tools, prompt pieces, message injections, UI, settings? Is an add-on code, configuration, or both? See decision 0006.
- When the user edits a built-in and a new Independum version changes the same built-in, what happens to the edit?
- Where do settings other than logins live: per project, per user, or both?
- What triggers a message injection, and what can it see?
- What does memory mean in Independum?
