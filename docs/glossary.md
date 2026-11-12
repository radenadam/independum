# Glossary

Use these concepts consistently. Definitions name things, and [product pages](product/README.md#area-router) own behavior. Hyphenated concepts become camelCase in code and keep kebab-case filenames. External API names remain fixed.

| Term | Meaning |
| --- | --- |
| Access token | Per-launch local control secret. |
| Add-on | User-added capability with built-in visibility and control. Avoid plugin or extension. |
| Added fact | Independently controlled fact added to model input. |
| Agent | Model and configured mechanisms working in a chat. |
| Approval | Explicit resource authority for a chosen lifetime. |
| Archived chat | Saved chat outside the ordinary sidebar. |
| Attachment | Retained original with an explicit model delivery form. |
| Background command | Shell work continuing after its tool call returns. |
| Branch | Selected saved message path, separate from project file state. |
| Built-in | Capability shipped with Independum. |
| Chat | User and agent messages saved through Pi. Avoid thread. |
| Commands | Side-panel place for Shell work. |
| Compaction | Summarizing older context while retaining recent messages. |
| Context | Input available to the model. |
| Denied path | Host path inaccessible to project tools. |
| Detach | End a component's profile contributions while keeping it installed. |
| Envelope | Source-identifying tag around a harness note. |
| Fingerprint | Hash identifying observed file content. Avoid snapshot. |
| Follower | Client holding a chat event stream. See [decision 0058](decisions/0058-address-chats-by-id.md). |
| Headless mode | Programmatic control without browser or interactive terminal. |
| Hook | Configured event observer or transformer. |
| Hook invocation | One captured hook execution and effect. |
| Independum | Local harness comprising command, server, and UI. |
| Kernel | Necessary chatbot connection, login, configuration, and conversation. |
| Login | Saved provider access through sign-in or key. |
| Login session | In-progress provider login interaction. |
| Maintainer | Owner of product intent and unresolved judgment. |
| Model | Provider-run model selected for work. |
| Model override | Profile value replacing a model catalog setting. |
| Model text | Individually controlled model-facing wording. |
| Note | Source-labeled harness message, possibly waking work. |
| Notification | Optional system notice of reply completion. |
| Operation | Waitable automatic work through Pi settlement. |
| Paired browser | Browser with explicit revocable phone authority. |
| Permission rule | Resource allow, ask, or deny policy. |
| Phone access | Separate opt-in private HTTPS listener. |
| Pi | SDK owning providers, logins, models, and loop. |
| Pinned chat | Chat retained atop the sidebar. |
| Place | Destination in a side-panel tab. |
| Profile | Complete agent setup in authoritative plain files. |
| Project | Folder where a chat works. Avoid workspace in product text. |
| Project instructions | Discovered literal instruction files. |
| Prompt variant | Submitted prompt alternative with its descendants. |
| Provider | Service running models. |
| Recent chats | Five newest unpinned chats. |
| Remove | Uninstall a component from Independum. Settings deletion is separate. |
| Reply | Answer spanning one or more model turns. |
| Reply attempt | One execution of a prompt variant. |
| Request | Data sent for one model turn. Reconstructed history is not capture. |
| Sandbox | Operating system boundary around workers and descendants. |
| Session | Place inspecting a chat's setup, context, and requests. |
| Shell | Tool running a command through the selected shell. |
| Side panel | Right column holding places. |
| Sidebar | Left column holding chat navigation and Settings. |
| Skill | Named `SKILL.md` resource with discoverable metadata. |
| Slash command | Leading invocation of an action, prompt command, or skill. |
| Slot | Named value position in a model text. |
| Step | Agent action such as a tool call. |
| Step group | Foldable work between reply texts. |
| Submission | Durably accepted input with an operation reference. |
| Thought | Model reasoning, distinct from an action. |
| Turn | One model response, including text and tool calls. |
| User | Person working with Independum. |
| Waiting message | Accepted input held outside Pi until delivery. Code currently says pending input. |
| Working screen | Chat with sidebar and side panel. |
