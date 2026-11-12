# Project folder selection

- Status: accepted, amends [decision 0013](0013-first-chat.md), [decision 0016](0016-working-screen.md), and [decision 0066](0066-headless-mode.md)
- Date: 2026-11-10
- Source: direct maintainer answer 8 to the healing proposal on 2026-11-10

## Context

Known-project selection does not let a newcomer start work in an arbitrary folder. Changing a working chat's folder raises instruction and future agent ownership questions.

## Decision

Provide a default project folder when none is selected. Let the user pick or create a folder anywhere, with corresponding headless control. A chat cannot change folders once work starts for now.

## Consequences

Arbitrary selection and creation remain CP-22 implementation gaps. Revisit mid-chat folder changes only with a clean solution that settles instruction loading and future subagent relationships. [Chats](../product/chats.md) describes the current launch-folder default and known-project limitation.
