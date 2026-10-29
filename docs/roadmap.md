# Roadmap

This file lists current work, next work, and questions for the maintainer. A change that finishes an item removes it. Lasting choices go in `docs/decisions`.

## Now

The maintainer agreed to these, and they come in this order, one small change at a time.

- Write and Edit, each planned with the maintainer before it is built. They use the fingerprints that decision 0043 describes to notice a file that changed since the chat saw it.
- An evaluation of the build so far with the maintainer, once Shell, Read, Write, and Edit are done, before any other work starts.
- Terminal mode, planned with the maintainer before it is built: an optional pseudo terminal for a command, which the user and the model can type into, and which the step shows as a live terminal.

## Next

- More tools, each planned the same way, such as web search, web fetch, an agent tool, and a browser.
- More for Read: outlines of large files, PDF, Word, Excel, and notebook files as text, several files in one call, folders, and no second read of a file that has not changed.
- Branching: edit and resend a prompt, retry a reply with the same or another model or effort, and fork a chat. Each makes a branch, which Pi already keeps, and a switcher under a message moves between branches. The look needs a decision first.
- Attachments: paste or drop images and files into a message.
- Queue and steer: while a reply runs, queue a message for after it, or steer the reply with it.
- Network access and phone pairing with a QR code. See decision 0005.
- Packaging: build the `independum` command, check that Windows has PowerShell 7 or Git Bash and explain why Independum needs one, recommend PowerShell from its installer over the one from the Microsoft Store as decision 0041 explains, serve the built UI, generate the favicon from the mark in `packages/web/src/mark.tsx`, and publish to npm. See decision 0010.

## Later

- Desktop app. See decision 0001.
- Learning: once the design and the features are done, make Independum a harness that a person learns and grows with, more than a minimal one to customize. It welcomes people who are new to agents, also without a background in coding, so they learn how an agent works while they shape it. A website and docs explain the ins and outs of Independum, for people and for agents.

## Open questions

Ask the maintainer when the related work starts, then record each answer as a decision.

- How do permissions and sandboxing work for commands and the other tools? Study the options once the tools are done, together with whether Independum ships its own PowerShell 7 or Git Bash instead of asking the user to install one. A PowerShell from its zip would also keep every program of a command in its job. See decisions 0029, 0035, and 0041.
- Which places come after Agent, Context, and Commands in the side panel, such as a terminal, a browser, files, or forking a chat, and how does each one look? See decisions 0016, 0026, and 0030.
- How does the user open a folder that is not a project yet?
- What does the contract for built-ins and add-ons cover: tools, prompt pieces, message injections, UI, settings? Is an add-on code, configuration, or both? See decision 0006.
- Pi compacts a chat by itself when it nears the limit of the context window, with prompts of its own. Does that stay on, and how does the chat show it?
- Should Independum edit the texts that Pi writes, or only show them? See decision 0033.
- The settings of tools belong to the user, as decision 0031 describes. Do some settings also belong to a project?
- The end of a background command adds a note that wakes the agent, as decision 0032 describes. What else may add a message to a chat, and what can it see?
- What does memory mean in Independum?
