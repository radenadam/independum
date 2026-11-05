# Roadmap

This file lists current work, next work, and questions for the maintainer. A change that finishes an item removes it. Lasting choices go in `docs/decisions`.

## Now

The maintainer agreed to these, and they come in this order, one small change at a time.

- An evaluation of the build so far with the maintainer, now that Shell, Read, Write, and Edit are done, before any other work starts. See the Evaluation section of `AGENTS.md`. It also compares Independum, workflow by workflow, with how a power user works with agent CLIs in tabs of a terminal, such as several agents at once, queue and steer, and questions from the model, and lists every gap, because the evaluation kept finding gaps one at a time.
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

- Graphics settings, either off and on, or low, medium, and high, each with a custom choice. The wave of the title of a replying chat is the richest motion, and a box with a bar that moves up and down in it is its lighter form for a low setting.

- Desktop app. See decision 0001.
- Learning: once the design and the features are done, make Independum a harness that a person learns and grows with, more than a minimal one to customize. It welcomes people who are new to agents, also without a background in coding, so they learn how an agent works while they shape it. A website and docs explain the ins and outs of Independum, for people and for agents.

## Open questions

Ask the maintainer when the related work starts, then record each answer as a decision.

- How do permissions and sandboxing work for commands and the other tools? Study the options once the tools are done, together with whether Independum ships its own PowerShell 7 or Git Bash instead of asking the user to install one. A PowerShell from its zip would also keep every program of a command in its job. See decisions 0029, 0035, and 0041.
- Which places come after Session and Commands in the side panel, such as a terminal, a browser, files, or forking a chat, and how does each one look? See decisions 0016, 0030, and 0048.
- How does the user open a folder that is not a project yet?
- What does the contract for built-ins and add-ons cover: tools, prompt pieces, message injections, UI, settings? Is an add-on code, configuration, or both? See decision 0006.
- Pi compacts a chat by itself when it nears the limit of the context window, with prompts of its own. Does that stay on? Decision 0048 defines how the Session place shows compactions, and decision 0052 defines their summary in the window figure.
- Does the harness logic still move into `packages/core`, as decision 0003 plans, and when? It currently stays in `packages/independum`.
- Should Independum edit the texts that Pi writes, or only show them? See decision 0033.
- The settings of tools belong to the user, as decision 0031 describes. Do some settings also belong to a project?
- The end of a background command adds a note that wakes the agent, as decision 0032 describes. What else may add a message to a chat, and what can it see?
- What does memory mean in Independum?
- A check of a background command can return while a line is still being printed, such as when it waits until a text appears. That line comes again, whole, with the next check, so the model reads it twice. Should the next check return only what was printed after it instead?
