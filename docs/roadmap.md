# Roadmap

This file lists current work, next work, and questions for the maintainer. A change that finishes an item removes it. Lasting choices go in `docs/decisions`.

## Now

- Finish the Pi spike with the ChatGPT login through the `openai` provider and `gpt-6-luna`. The maintainer signs in through the browser. See decision 0002.

## Next

- Check an API key when it is saved, since Pi saves keys without testing them. See decision 0011.
- First chat: send a message from the browser and stream the reply.
- Network access and phone pairing with a QR code. See decision 0005.
- Packaging: build the `independum` command, serve the built UI, generate the favicon from the mark in `packages/web/src/mark.tsx`, and publish to npm. See decision 0010.

## Later

- Desktop app. See decision 0001.

## Open questions

Ask the maintainer when the related work starts, then record each answer as a decision.

- What does the chat screen look like, and where do project and session settings open from?
- What does the contract for built-ins and add-ons cover: tools, prompt pieces, message injections, UI, settings? Is an add-on code, configuration, or both? See decision 0006.
- When the user edits a built-in and a new Independum version changes the same built-in, what happens to the edit?
- Where do settings other than logins live: per project, per user, or both?
- How does the user choose the folder the agent works in?
- What triggers a message injection, and what can it see?
- What does memory mean in Independum?
