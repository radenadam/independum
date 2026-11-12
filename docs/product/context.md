# Context controls

Decision: [0062](../decisions/0062-project-resources-and-context-controls.md). Session opens Context controls for project instructions, skills, slash commands, and supported Pi additions. The selected [profile](profiles.md) owns these settings and the rendering texts. No resource runs a script or registers a model tool.

## Settings and discovery

`profile.json` accepts `settings.context`. The complete type and built-in values live in [the context settings](../../packages/independum/src/read-context-settings.ts). Omitted nested fields use those built-in values, and arrays replace them. Invalid fields and unavailable Pi ids block profile application and new work. Existing work keeps its applied profile.

The context editor reads the current saved profile values even while a reply waits for permission and keeps an older applied profile. Instruction names stay literal list entries, including spaces and commas. Refreshing the chat does not replace a saved edit with the running reply's older settings.

Instructions consider every configured basename from the registered project root through the chat folder. The current API registers the exact folder as the root. Discovery never follows tool paths or expands imports. Files with the same filesystem identity or identical bytes contribute once. Different line endings or byte order marks make different byte sequences. Insertion removes only a leading UTF-8 byte order mark. Enabled unreadable instructions prevent provider calls. Disabling a candidate unblocks the request without hiding its diagnostic.

Browser replies request unresolved enabled resources before preparing context. API replies keep headless delivery and leave unresolved resources unread. The resource catalog offers Request read access for an unresolved source, and the chat shows its approval. Replacing a source identity, changing the profile, or changing the chat branch invalidates its grant.

The resource catalog keeps sources that are off, invalid, duplicates, overridden, or waiting for permission. It includes scope, path, reason, aliases, raw byte count, SHA-256 fingerprint, source, metadata, and exact inserted text. User, profile, and project roots follow the order and locations in decision 0062. Configured resource paths belong to the profile and resolve against its folder. Discovery uses the [permission policy and approval store](permissions.md). Resources outside the project remain unread until a matching rule or approval permits their read. Directory discovery requests tree scope before enumeration, and a link target needs its own matching grant.

Containment compares real filesystem locations, including linked folders. A missing path uses its nearest existing parent's real location. Catalog paths and aliases keep the caller's spelling, so saved disabled paths keep matching. A missing chat folder reports that it does not exist before containment is checked.

Skills require their containing folder name and a description in YAML frontmatter. Names use at most 64 lowercase ASCII letters, digits, and single hyphens. Descriptions contain from 1 through 1,024 characters. Metadata advertisement contains no skill body or behavioral advice. The `disable-model-invocation` boolean omits advertisement but permits explicit invocation. Advertisement and skills have separate switches. Unsupported fields stay visible without changing tools, permissions, or model settings. The original body preserves whitespace because Pi's frontmatter body trims it.

Session names the profile being edited and the number of chats that use it in one sentence. Its folder uses the copyable path display. Context controls pair each switch with a visible label. Make skills available controls both skill use and the model's skill list. Send skill names and descriptions controls only that list, so skills can remain available through slash commands without sending their descriptions. Instruction and skill text edits use labeled buttons, with a reset while their texts differ from built-in values.

Instruction filenames and additional skill and command paths use individual list entries, like environment settings. Adding or removing an entry saves the list immediately. Each added value stays whole, including commas and spaces. Instruction filenames keep their listed order. Command substitution details unfold on demand. Resource paths use the copyable path display, and file fingerprints and metadata stay inside File details. A search with no matches says so.

Source editing requires write permission and saves the whole known file after a fingerprint comparison through Pi's mutation queue. A stale source fails and leaves the draft open. The browser preserves the starting line endings and byte order mark. The API accepts exact replacement text. User files have no built-in reset.

## Commands

A leading slash opens searchable command choices. Selecting a prompt command or skill captures an editable composer preview. Send on a typed invocation first captures that preview. The next Send submits its shown text. A source line opens the original invocation, arguments, captured expansion, fingerprint, and expiry. Editing the preview preserves that original provenance. Pi never expands the submitted result again.

The command preview names its purpose above the message box and sets the original invocation in monospace. A long invocation fades at the end of the title and stays readable in full inside its details. Its values, original message, file fingerprint, and expiry have plain labels. Those details scroll within a bounded area, so the message box stays reachable on a phone. Restore command returns to the original invocation. A note states that Send submits the text shown in the message box.

Prompt commands are direct Markdown children of a command root, with required `description` and optional `argument-hint`. Their filename supplies the name. Built-in names are reserved. Positional substitution, defaults, slices, quote grouping, and literal backslashes follow [the exported expander](../../packages/independum/src/expand-command.ts). Substitution runs once. Skill invocation uses `/skill:name` and appends the exact argument tail after the preserved body.

Unknown commands fail. `//text` submits `/text`, and API literal interpretation submits any leading slash unchanged. Turning slash commands off sends slash text literally and disables composer skill invocation. Turning advertisement off keeps explicit skill invocation. Earlier user messages and permitted file tools keep their contents and access.

## Requests and Pi

The owned prompt pipeline includes the base prompt, added facts, project instructions, and skill metadata as separate system sections. Their switches remove their respective copies from future system input. Pi's coding persona, tool overview, rules, documentation, folder, and addendum are independently permitted or omitted when present. Automatic Pi resource discovery stays off.

Prompt and tool update controls project current state into the leading system message and remove only the corresponding later deltas. User, assistant, and tool result order stays intact. Other controls remove typed summary envelopes and user shell messages, or disable Pi's automatic image resizing. Each unavailable adapter text currently remains read-only with its source and reason in Pi context. This is an implementation gap. [Decision 0072](../decisions/0072-editable-pi-texts.md) accepts a narrow Pi text patch while preserving provider compatibility ownership. These controls do not transform provider payloads or change model compatibility flags.

Each provider call uses an immutable context revision. Changed revisions are saved as `independum-context` custom Pi entries. They never enter model messages. Session distinguishes pending discovery from the last captured revision. Request history marks revision changes as setup changes. The raw last request retains its existing best effort storage and matching limits.

[Script hooks](hooks.md) extend these Pi boundaries after owned context projection. Final provider hooks also transform the owned summary request. A stopping hook failure prevents sending a provider request even when Pi catches its handler error.

## Compaction

The existing automatic compaction switch and budgets remain. The additional Compaction permission in Pi context cancels manual, threshold, and overflow compaction and removes the automatic reserve. It does not undo saved summaries.

The replacement summarizer uses Pi's prepared boundary and makes one request through `ModelRuntime.completeSimple`. A virtual model resolves through Pi first. Both message arrays and the previous summary enter JSON without truncation. Images become numbered references in the JSON and native image blocks in encounter order. Provider reasoning is omitted explicitly. Separate switches control the system text, instructions, file operations, and image labels. Owned texts and the later summary envelope are editable under Compaction.

An incomplete, empty, failed, aborted, or tool calling response cancels compaction, with the original chat intact. There is no fallback to Pi's built-in summarizer. Session records the summary input, provider payload, enabled texts, fingerprints, and failure separately as `independum-compaction-request`. Successful compaction details also hold that capture. The Compaction detail shows the newest ten summary requests and saved summaries retain their details.

## API

All routes have the existing `/api/chats/:id` prefix and access checks.

| Method and path | Behavior |
| --- | --- |
| `GET /resources` | Read the effective context revision, catalog, and diagnostics. |
| `GET /resources/:resourceId` | Read one captured source. |
| `PUT /resources/:resourceId` | Save exact `content` against its starting `fingerprint`. |
| `POST /resources/:resourceId/approval` | Request read access for a catalog resource through the existing approval API. |
| `POST /resources/reload` | Reload profile settings and discovery. |
| `POST /compose` | Interpret `text` as `literal` or `commands`, returning a captured literal message, preview, or built-in action. |
| `POST /slash-actions` | Execute the action named by `previewId` without sending a model message. |
| `POST /messages` | Submit the [identified input](server.md#routes-and-payloads) with exact `text`, optional `interpretation`, and optional `previewId`. Acceptance captures preview text and provenance for later queued or steered delivery. |

Context settings use the existing conditional profile settings route, with its disk revision and error contract. Previews belong to one chat and expire after five minutes. Resource changes and summary captures emit the existing `contextChanged` event so Session and the meter refresh while the chat runs.

## Remaining checkpoint work

The [roadmap](../roadmap.md) records nested chat folder UI, catalog invocation and exact skill navigation, saved message provenance actions, long catalog browser verification, and the narrow Pi text patch. Current source writes compare fingerprints before writing, but external editors do not honor Pi's mutation queue. No provider omission switch is offered when its effect is unavailable.

## Code

- [Discovery and guarded source editing](../../packages/independum/src/resolve-context.ts), [command previews](../../packages/independum/src/create-command-previews.ts), and [typed projection](../../packages/independum/src/project-context-messages.ts).
- [Owned rendering texts](../../packages/independum/src/context-texts.ts), [replacement summarizer](../../packages/independum/src/summarize-context.ts), and [Session controls](../../packages/web/src/context-resources-detail.tsx).
