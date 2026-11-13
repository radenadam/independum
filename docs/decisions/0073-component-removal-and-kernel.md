# Component removal and kernel

- Status: accepted, amends [decision 0006](0006-built-ins-and-add-ons-share-one-contract.md) and [decision 0065](0065-script-hooks-and-the-add-on-contract.md)
- Date: 2026-11-10
- Source: direct maintainer answer 1 to the healing proposal on 2026-11-10

## Context

Disabling is not uninstallation. The common contract needs an explicit lifecycle without destroying past inspection or silently deleting configuration.

## Decision

Offer both detach from a profile and remove from Independum. Detachment leaves the installation available to other profiles. Both operations end future contributions in their scope. Past chats retain evidence of what the component did. Settings deletion is a separate explicit choice.

A small kernel remains for model connection, login, configuration, and conversation. Agree its detailed boundary in writing before implementing removal.

## Consequences

The existing switches and script slice do not complete removal. Build one full journey before migrating built-ins. [The product contract](../product/README.md#visibility-and-control) owns current intent, and CP-02 and CP-03 track acceptance.
