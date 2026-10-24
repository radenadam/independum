# Roadmap

This file lists current work, next work, and questions for the maintainer. A change that finishes an item removes it. Lasting choices go in `docs/decisions`.

## Now

- Pi SDK spike: confirm that Independum can own the system prompt, change the context before each model call, replace the tool set and instruction file loading, and stream events to the UI. The result updates decision 0002 and starts `packages/core`.

## Next

- First chat: send a message from the browser and stream the reply, with the UI and server running from one `pnpm dev`.
- Token auth and phone pairing. See decision 0005.
- Packaging: build the `independum` command and publish it to npm.

## Later

- Desktop app. See decision 0001.

## Open questions

Ask the maintainer when the related work starts, then record each answer as a decision.

- What does the contract for built-ins and add-ons cover: tools, prompt pieces, message injections, UI, settings? Is an add-on code, configuration, or both? See decision 0006.
- When the user edits a built-in and a new Independum version changes the same built-in, what happens to the edit?
- Where do settings live: per project, per user, or both?
- How does the user choose the folder the agent works in?
- Which providers and login methods come first?
- What triggers a message injection, and what can it see?
- What does memory mean in Independum?
