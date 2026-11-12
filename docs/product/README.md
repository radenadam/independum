# Product definition

Independum is a harness where a user builds their own agent. Its default profile is also a working agent after the user connects a model login or API key. It serves newcomers willing to learn, enthusiasts, researchers, automation builders, and organizations. It is not limited to coding.

This is the accepted contract, not a claim of completion. [The checkpoint](../checkpoint.md) owns acceptance and evidence. Area pages below own shipped behavior and limits. [Decision 0071](../decisions/0071-repository-healing.md) records the reset.

## Visibility and control

The user sees what the model receives and what the harness does around it. They can inspect, edit, reset, disable, detach, or remove components wherever applicable, down to a plain chatbot. Detaching removes a profile's future contributions while keeping the part installed for others. Removing it from Independum also ends its future contributions. Historical evidence remains. Deleting settings is a separate explicit choice. The kernel retains model connection, login, configuration, and conversation. Its detailed boundary must be agreed in writing before implementation. [Decision 0073](../decisions/0073-component-removal-and-kernel.md) owns that distinction.

Three controls express one contract:

- On screen, discover, understand, configure, and operate the mechanism.
- In plain files, read and change authoritative configuration in an ordinary editor.
- Headless, control the same mechanisms from scripts, agents, and other software with efficient commands and structured results.

Parity covers settings, the user's work, and agent operations. Menus, hover, selection, and folded sections are transient screen mechanics. A raw JSON editor does not complete an understandable authoring flow. An HTTP endpoint alone does not complete a documented headless workflow. New tool logic may need code, but its finding, installation, configuration, inspection, disabling, and removal have all three controls. Tool source editing on screen is a later decision. [Decision 0075](../decisions/0075-control-parity-and-newcomer-journeys.md) records these boundaries.

## What the model receives

Independum is sufficient. It gives complete facts and functions, and the model decides how to work. It adds no unsolicited best practices and never silently repairs a call. Unsupported exact behavior fails with its reason. It states environment facts instead of changing a program to compensate for model knowledge. Shared conditions such as cut output are explained when they happen, outside tool descriptions. Research informs choices that fit this purpose.

An explicitly controlled feature whose purpose is steering, such as compaction, can steer. Every added fact has its own switch and model text. A model cutoff comes only from the user's value for that provider and model. A model text or setting is edited only while its value differs from its built-in value. Tool names and parameter names and types remain fixed. Descriptions and all conditional result wording are model texts with individual resets from shipping.

Provider-imposed texts stay visible and explained. Pi-owned wording becomes editable through the narrow patch of [decision 0072](../decisions/0072-editable-pi-texts.md). Required protocol structure does not make chosen wording immutable. Pi retains compatibility ownership.

## Readiness

Technically ready means fulfilling these promises with the current six tools. It includes complete profiles, resources, compaction, hooks and add-ons, permissions, conversation controls, attachments, headless control, phone use, and newcomer usability. More tools, memory, extended learning material, distribution, and the website follow later. The coordinator's `0.5` naming in decision 0057 does not reduce acceptance.

Full request history is optional and off by default for performance. When enabled, ordinary calls, retries, compaction, and cache warming retain their settings with retention and deletion controls and incomplete-capture labels. [Decision 0074](../decisions/0074-optional-request-history.md) records the accepted target. The current last-request capture is partial support.

## Area router

- [Chats](chats.md), [message box](message-box.md), [replies](replies.md), and [attachments](attachments.md) own conversation behavior.
- [Profiles](profiles.md), [settings](settings.md), [context](context.md), and [hooks](hooks.md) own configuration and composition.
- [Permissions](permissions.md) and [tools](tools.md) own execution and access.
- [Side panel](side-panel.md) owns inspection and navigation.
- [Headless](headless.md) owns the implemented command protocol. [Server](server.md) owns lifecycle and transport.

Use the [glossary](../glossary.md). [Design](../design.md) owns visual meanings. [The roadmap](../roadmap.md) orders unfinished work.
