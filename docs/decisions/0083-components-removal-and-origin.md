# Components, removal, and origin

- Status: accepted, supersedes [decision 0006](0006-built-ins-and-add-ons-share-one-contract.md), amends [decision 0065](0065-script-hooks-and-the-add-on-contract.md) and [decision 0073](0073-component-removal-and-kernel.md)
- Date: 2026-11-15
- Source: direct maintainer product answers on 2026-11-14 and 2026-11-15, with language-neutral component communication delegated to the coordinator on 2026-11-15
- Kind: product requirement and delegated implementation choice

## Context

Built-in and add-on kinds keep implying two classes despite the intended shared contract. Removal that only hides an installation duplicates an existing off switch. Kernel reduction in decision 0073 also changes which parts must participate.

## Decision

Everything outside the kernel is a component, including the loop and Script tool. Retire built-in and add-on as kinds. Show origin, such as Independum, the user, or an MCP server, rather than granting an internal shortcut.

Components communicate with the kernel through a language-neutral protocol. A tool, loop, or hook can be written in any language. TypeScript remains the easiest path. This is a delegated coordinator choice, not a direct maintainer protocol design.

Detach ends the selected profile's contributions while leaving the installation available. Remove deletes the component from disk and ends its future contributions. Download it again to restore it. Settings deletion is a separate explicit choice.

Changes apply from the next request. A reply already running finishes with its captured setup. This retains the running-reply boundary rather than hot-swapping it midway.

Old chats keep exact records of removed components. Mark Removed in each affected card header and omit buttons whose actions need the component. Historical inspection never silently substitutes the installed current version.

## Consequences

This supersedes decision 0006's vocabulary while preserving its single-contract principle. It amends decision 0073 with physical deletion and the smaller kernel, whose boundary is in [decision 0082](0082-kernel-without-harness-decisions.md). Decision 0065 remains evidence of the shipped script slice, not a general component loader.

[Profiles](../product/profiles.md) owns lifecycle and application timing. [Replies](../product/replies.md#removed-components) owns historical cards and [side panel](../product/side-panel.md) owns inspection. CP-02, CP-15, and CP-36 track missing implementation and conformance. Protocol design must exercise removal, reinstall, dependencies, and retained records before migration.
