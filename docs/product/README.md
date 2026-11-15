# Product definition

Independum is a harness engineering tool, made easy and transparent. Build your own agent, see exactly what it does, and change any part. It serves research, development, teaching, automation, businesses, teams, and assistants. Judge each market by how easily people can engineer Independum into their workflow.

This contract follows direct maintainer product answers of 2026-11-15. The kernel boundary is coordinator judgment accepted by the maintainer. The meanings of easy and the language-neutral protocol are delegated choices. [Decisions 0081](../decisions/0081-harness-engineering-and-two-halves.md) through [0086](../decisions/0086-stay-in-typescript.md) record reasons and reversals. [The checkpoint](../checkpoint.md) owns acceptance. Area pages distinguish implementation from promises.

## Two halves

This checkpoint makes Independum ready as a harness engineering tool. Everything about engineering the harness belongs here. A default profile works after connecting a model, with minimal tools and a full agent loop. The screen layout redesign serves someone who already knows agents, starting with the maintainer. [Design](../design.md#journeys) owns its seven journeys.

The shipping half follows: agent capability competing with Claude Code, Codex, OpenCode, and Cursor, mostly through more tools, packaging, extensive documentation, the GitHub README, website, memory across chats, and tailoring language and guidance for people new to agents. That tailoring adjusts the redesigned interface.

## Principles

- Easy means no cliff. Touch the same part on screen, in a file, in a small script, or in code.
- Transparent means exact. Everything the model saw and the harness did is visible, recorded, and reproducible.
- Modular means real removal. Apart from a small kernel, every part can be added, detached, or deleted from disk.

## Parts of a harness

A harness includes context assembly and earlier turns, model texts, tools, execution, the loop, hook stages, permissions, and profiles that compose them. Inspection connects their effects to their causes.

The kernel holds no harness decisions. It connects through Pi, makes one model call, records exactly what went in and came out, saves that record, and offers screen, files, and settings to engineer everything else. Only the kernel calls models. Without a loop, each message makes one exact call without earlier turns, and the screen says so. A chatbot adds a small chat loop component. [Decision 0082](../decisions/0082-kernel-without-harness-decisions.md) replaces the chatbot kernel.

Everything outside the kernel is a component. Origin identifies who made it, such as Independum, the user, or an MCP server. Built-in and add-on are retired as kinds. Components use a language-neutral kernel protocol. TypeScript stays the easiest path. Detach ends a profile's contributions while keeping the installation. Remove deletes it from disk. Download it again to restore it. Settings deletion remains explicit. Changes apply from the next request. A running reply finishes with its captured setup. Old chats retain exact records, marked Removed in card headers, without actions needing the component. [Decision 0083](../decisions/0083-components-removal-and-origin.md) owns this lifecycle.

One universal tool contract supplies name, description, parameters, execution, and editable texts. Independum tools, scripts, MCP servers, command line programs, and HTTP APIs enter through this doorway. The model still sees tools and calls them. Script is a removable tool component. Its parameter is a short program calling other tools as functions, from any source. Each profile exposes each tool directly, inside Script, or both. [Tools](tools.md#universal-tool-contract) owns this target.

Independum owns the replaceable loop. It runs requested tools, returns results, and repeats until done. Engineer it through screen controls, file stages, a script, or a code component. Hook events become stages of that loop. Pi keeps providers, logins, and models. Independum stays in TypeScript.

## What easy means

1. From effect to cause: select any exact request part, find its component, and edit there.
2. No cliff: screen, files, scripts, and code expose the same part and show the next depth.
3. Safe experiments: reset, revert, copy a profile, replay a past request, and compare side by side.
4. Fast feedback: preview the exact request and test tools or hooks with sample input without a model call.
5. Shareable: version, copy, and install plain profile and component files.
6. Self-explaining: components declare effects and dependencies, and failures give exact reasons.
7. Few concepts: use one small, consistent vocabulary.

## Visibility and control

Screen, authoritative files, and headless workflows cover settings, user work, and agent operations. Transient screen mechanics are excluded. Raw JSON alone does not complete screen authoring. An endpoint alone does not complete a headless workflow. Supply complete facts and exact calls without unsolicited advice or silent repairs. Every owned text and added fact has controls. Only explicitly controlled steering mechanisms steer. Knowledge cutoffs use only the user's provider and model value. Tool names and parameter names and types stay fixed for a tool definition. Edits exist only while values differ from shipped defaults. Provider requirements stay visible and explained. [Decision 0072](../decisions/0072-editable-pi-texts.md) permits a narrow text patch without transferring provider compatibility.

## Running elsewhere

Channels such as Discord, WhatsApp, team services, schedules, and batch runs are direction only. Each gets its own profile, tools, and permissions. Exposed channels never inherit local account authority.

## Area router

- [Chats](chats.md), [message box](message-box.md), [replies](replies.md), and [attachments](attachments.md) own conversations.
- [Profiles](profiles.md), [settings](settings.md), [context](context.md), and [hooks](hooks.md) own composition.
- [Permissions](permissions.md) and [tools](tools.md) own execution.
- [Side panel](side-panel.md) owns inspection. [Headless](headless.md) and [server](server.md) own control and transport.

Use the [glossary](../glossary.md) and [roadmap](../roadmap.md).
