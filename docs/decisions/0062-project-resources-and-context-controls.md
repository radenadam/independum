# Project resources and context controls

- Status: accepted, with the remaining work listed in `docs/roadmap.md`, amended for the request event pipeline by [decision 0065](0065-script-hooks-and-the-add-on-contract.md), which dispatches scripts at the owned context boundaries
- Date: 2026-11-06

## Context

The maintainer approves the context proposal for project instructions, skills, slash commands, and Pi controls. Every addition must become removable before the 0.5 checkpoint is complete. Pi supports resource discovery overrides, typed request projection, and replacement compaction, but some provider additions have no independent public control.

Decision 0061 gives every agent setting to a profile. Resource settings follow that ownership instead of introducing another settings hierarchy. Independum keeps Pi discovery disabled and discovers only the selected resources itself.

## Decision

- A profile owns `settings.context` in `profile.json`. Omitted fields use the built-in values. Objects inherit individual built-in fields, and arrays replace their built-in arrays. Invalid context settings block dependent new work through the existing profile validation. User and project settings still select profiles and hold no context overrides.
- Instruction names default to `AGENTS.md` and `CLAUDE.md`. Names are literal basenames. Discovery visits every name from the registered project root through the chat folder, without ancestors, imports, or changes caused by tool paths. The current chat API registers its exact folder as its project root.
- Files are deduplicated first by filesystem identity and then by identical bytes. Line endings and byte order marks affect equality. Insertion strips only a leading UTF-8 byte order mark. Empty files stay visible. Enabled instruction diagnostics block the provider call.
- Skills use Pi's exported YAML frontmatter parser with stricter name and description validation. Independum preserves the original body because Pi's parser normalizes and trims it. Advertisement contains only escaped metadata. Explicit skill invocation previews the untrimmed body and argument tail. Unsupported metadata stays visible without granting an effect.
- User resources live in `skills` and `commands` under the Independum home. Profile resources use those names under the selected profile. Project skills use `.agents/skills`, and project commands use `.independum/commands`. Profile paths resolve against the profile folder. User resources precede profile resources, followed by project directories from root to folder. Later declarations override earlier ones, and every source remains visible.
- A resource outside its allowed scope, including a link target, says `Needs permission` before its content is read. Discovery uses the permission policy and approval service of decision 0063. External reads and source edits require their respective grants before content access.
- Slash commands expand once into an editable composer preview. The server captures the invocation, arguments, fingerprint, expansion, chat id, and five minute expiry. Submission uses the captured expansion or the user's literal edit. Accepted submissions are idempotent. Pi receives the message with prompt expansion disabled.
- Built-in command names remain reserved. Existing UI actions execute without a model message. Prompt commands support positional arguments, defaults, and slices. Quotes group arguments, quoted empty values remain arguments, and backslashes remain literal. Unknown commands fail, and a doubled leading slash sends one literal slash.
- Each request has one owned prompt pipeline with separate base prompt, added facts, project instructions, and skill advertisement. Each part has its own switch. The current resource and fact sections replace their historical system copies, so turning them off removes them from future requests. Historical user messages and tool results stay intact.
- Pi sections, prompt and tool update notices, summary envelopes, user shell messages, and image resizing have controls at public typed seams. Removing update notices projects current state at the beginning. No provider payload is stripped and no compatibility flag changes. Unavailable adapter additions keep individual inventory entries with their reasons and sources.
- Automatic compaction stays on by default. The existing automatic switch and token budgets remain. An additional compaction switch cancels manual, threshold, and overflow compaction and removes the automatic reserve. Turning it off leaves earlier summaries intact.
- The replacement summarizer makes one call through Pi's model runtime. It includes both prepared message arrays and the previous summary as JSON, with native images in encounter order. Provider reasoning is omitted explicitly. System text, instructions, file operations, and image labels have switches. The owned instruction texts and summary envelope are editable model texts. Failed, empty, aborted, tool calling, and partial responses never produce a checkpoint, and failure cancels Pi's fallback summarizer.
- Used context revisions and command provenance are custom Pi entries that never enter model messages. Summary input and provider payload are captured separately. Session shows pending and captured resource revisions, exact sources and inserted texts, diagnostics, controls, and summary requests. Source edits compare fingerprints and preserve the editor's starting line endings and byte order mark.

## Consequences

- This decision extends decisions 0033, 0034, 0048, and 0053. It replaces the read-only built-in compaction prompts and uncaptured summary calls of decision 0055. Decision 0052 keeps its figure design and reads the effective compaction state.
- Pi still owns the agent loop, model routing, boundaries, sessions, and compaction persistence. Independum adds discovery, strict validation, command expansion, typed context projection, and the replacement summary input.
- The checkpoint remains incomplete until Pi exposes provider-neutral omission policies for adapter additions. The roadmap records the upstream seam and remaining interactions and browser verification.
- Source edits use Pi's file mutation queue and compare the current fingerprint before writing. An unrelated external editor does not honor that queue, so the final replacement cannot guarantee compare-and-swap against it.
- Context controls use the current profile. No compatibility shim or second settings layer is introduced.
