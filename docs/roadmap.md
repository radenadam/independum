# Roadmap

This file lists current work, next work, and questions for the maintainer. A change that finishes an item removes it. Lasting choices go in `docs/decisions`.

## Now

The 0.5 checkpoint of [decision 0057](decisions/0057-versions-and-checkpoints.md): everything Independum promises, with the tools it has today. The maintainer agreed to it, and its parts come in this order, each planned from a design proposal and checked in the running app.

- Complete [profiles and plain settings](product/profiles.md): move theme, notification choice, column widths, and figure pinning into a separate plain file for each browser, with conditional import of old browser preferences.
- Complete profile management: delete only unreferenced profiles, checking user and known project defaults and saved and archived chats.
- Complete profile editing: show the exact source beside each setting, compare and reapply stale model text drafts, normalize external text edits equal to their built-in value through guarded writes, and show the resolved automatic effort before a profile switch.
- Complete configuration recovery and events: recover abandoned locks after verifying their writer has stopped, clean staging files left before a journal is prepared, carry explicit resource identities and revisions to browsers, and exercise crashes and simultaneous external saves on every supported system.
- Complete context control from [decision 0062](decisions/0062-project-resources-and-context-controls.md): obtain Pi's provider-neutral additions policy at each creation site, with stable source ids, independent omission controls, and explicit errors for unsupported omissions. This includes subscription identity, deferred placeholder declarations, native thinking markers, empty system fallbacks, tool validation and repair text, and image conversion and omission notices. No provider payload transformer or compatibility override substitutes for that API.
- Complete resource interactions: expose nested chat folders under a separately registered project root, invoke skills from the catalog, open an exact skill from its built-in slash action, add full command provenance to saved message actions, and validate the long catalog and request history in browser QA. Profile scope owns resource paths and settings.
- Complete the approved [hook and add-on contract](product/hooks.md) from decision 0065: add manifests, managed code add-ons, declared tools and settings, prompt pieces, public activities and result presentations, and migrate every built-in through the same contract. Keep existing built-in model text ids.
- Extend script hooks with fixture testing, notes, lifecycle and boundary events, and hook-requested continuations with the approved default limit of eight and null for unlimited. Add candidate reload generations, durable dependency fingerprints and pending disk changes, pagination and older invocation inspection, and conformance tests for retries, cache warming, summary requests, native cancellation and descendants, and long histories.
- Complete [permissions](product/permissions.md): compile write-only rule exclusions as exact grants where the backend permits them. Ask MXC for read-only private masks for denied folders so the Linux permission fact can become a plain denial. Run shell version queries inside the sandbox and show their verified results. Add the Session rule tester, dedicated rule editing routes, explicit approval events, complete rule match details, and the remaining native tests for file races, host sockets, alternate socket families, simultaneous grants, and background authority. Verify the system read boundary of [decision 0067](decisions/0067-read-everywhere-and-write-inside-the-project.md), native enforcement, and the approval UI on supported Windows, macOS, and Linux hosts. Tell the model in a Shell result when the sandbox denied an access, where the platform reports it, such as through MXC denial capture on Windows, because today the model sees only the error of the program.
- Attachments from the approved conversation design: picker, paste, drop, original byte retention, exact file read grants through approvals, editable attachment texts, limits, and visible delivery forms. Queue and steer with stop and resume ships in [decision 0064](decisions/0064-queue-and-steer.md).
- Edit and resend, retry, and fork with Pi branches from the approved conversation design: retained attachment sources, stable prompt variants and reply attempts, saved descendant selections, and the filled tile switcher. Retry uses current agent settings and a fork leaves its source running.
- A headless mode for scripts and other agents, with full control and output that costs few tokens.
- Review the added facts of [decision 0054](decisions/0054-added-facts.md) in the running app with the maintainer, including phone width and the texts and switches of the request.
- A last pass of the whole checkpoint with `pnpm qa` and real models, before the version drops its `-dev` suffix.

## Next

- More tools, each planned the same way, such as web search, web fetch, an agent tool, and a browser.
- More for Read: outlines of large files, PDF, Word, Excel, and notebook files as text, several files in one call, folders, and no second read of a file that has not changed.
- Packaging, for the 1.0 release as decision 0057 says: build the `independum` command, check that Windows has PowerShell 7 or Git Bash and explain why Independum needs one, recommend PowerShell from its installer over the one from the Microsoft Store as decision 0041 explains, serve the built UI, generate the favicon from the mark in `packages/web/src/mark.tsx`, and publish to npm. See decision 0010, and make the command check the Node.js version of decision 0059 when it starts.

## Later

- Terminal mode: an optional pseudo terminal for a command, which the user and the model can type into, and which the step shows as a live terminal. The 0.5 checkpoint has a headless mode instead, for scripts and other agents.
- Graphics settings, either off and on, or low, medium, and high, each with a custom choice. The wave of the title of a replying chat is the richest motion, and a box with a bar that moves up and down in it is its lighter form for a low setting.

- Desktop app. See decision 0001.
- Learning: once the design and the features are done, make Independum a harness that a person learns and grows with, more than a minimal one to customize. It welcomes people who are new to agents, also without a background in coding, so they learn how an agent works while they shape it. A website and docs explain the ins and outs of Independum, for people and for agents.

## Open questions

Ask the maintainer when the related work starts, then record each answer as a decision.

- The UI and the glossary call a message accepted during a reply a waiting message. Should the code, the API routes, and the `pending-inputs` folder take that name too?
- Which places come after Session and Commands in the side panel, such as a terminal, a browser, files, or forking a chat, and how does each one look? See decisions 0016, 0030, and 0048.
- How does the user open a folder that is not a project yet?
- Does the harness logic still move into `packages/core`, as decision 0003 plans, and when? It currently stays in `packages/independum`.
- Should Independum edit the texts that Pi writes, or only show them? See decision 0033.
- What does memory mean in Independum?
- A check of a background command can return while a line is still being printed, such as when it waits until a text appears. That line comes again, whole, with the next check, so the model reads it twice. Should the next check return only what was printed after it instead?
