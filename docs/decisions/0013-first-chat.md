# First chat

- Status: accepted, and amended by [decision 0016](0016-working-screen.md), which adds project folders and Markdown replies, by [decision 0029](0029-own-tools.md), which gives the agent its own tools and makes `@earendil-works/pi-ai` a dependency, by [decision 0048](0048-session-place.md), which exposes the prompt, by [decision 0051](0051-chats-run-on-their-own.md), which runs chats independently, and by [decision 0053](0053-documented-behavior-and-limits.md), which qualifies startup selection by folder, and by [decision 0058](0058-address-chats-by-id.md), which gives each client its own chat stream, amended by [decision 0064](0064-queue-and-steer.md) for durable queue and steering delivery
- Date: 2026-10-25

## Context

With logins working, the next step is a chat from the browser. The maintainer chose a model picker over a fixed model, a chat without tools at first, and chats that survive a restart.

## Decision

- Each chat runs as its own Pi agent session on the server. Each client follows its chosen chat through an event stream, as it follows logins in decision 0011, and drives it through the API by id. See [decision 0058](0058-address-chats-by-id.md).
- The model picker lists the models of every provider with a login, as Pi reports them.
- A chat starts only after the user chooses a model. Without a model, Pi would pick a provider default that the user never chose. For the same reason, a reopened chat whose model lost its login waits for a new choice.
- The first chat has no tools. Independum's own system prompt says so, so the model never pretends to use one.
- Pi's other resources stay off: context files, skills, prompt templates, themes, extensions, and Pi's settings files. Pi still appends its `<cwd>` block, as decision 0002 describes.
- Pi saves every chat as a session file in `~/.independum/sessions`. The most recent chat reopens when Independum starts, and "New chat" starts an empty one with the same model.
- The agent works in the folder that Independum starts from.

## Consequences

- [Decision 0068](0068-message-attachments.md) adds attachment-only prompts and retained source files.

- Replies, retries, errors, and compaction are Pi's. A wrong key shows up as the error of the first reply.
- Tests run a whole chat against Pi's fake provider from `@earendil-works/pi-ai`, so `pnpm check` stays offline. That package is a dev dependency pinned to the version Pi uses, and Dependabot updates both in one pull request.
- The system prompt and Pi's additions are not visible in the UI yet. Showing them comes with built-ins.
- Replies show as plain text, and the commands sit beside the chat, until the chat screen is designed. That design is an open question in the roadmap.
- On a touch screen, Enter adds a new line and the Send command sends, because a phone keyboard has no Shift and Enter. On a screen with a pointer, Enter sends.
