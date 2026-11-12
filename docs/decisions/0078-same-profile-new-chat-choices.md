# Same-profile new chat choices

- Status: accepted, clarifies [decision 0058](0058-address-chats-by-id.md) and amends [decision 0061](0061-profiles-and-plain-settings.md)
- Date: 2026-11-10
- Source: delegated behavior restored during profile integration and retained by the approved healing proposal on 2026-11-10

## Context

Decision 0061 describes defaults replacing source choices, but the integrated implementation preserves model and effort when the resolved profile matches. The product pages contradicted the source and tests.

## Decision

Document the integrated same-profile rule in [chats](../product/chats.md#open-chat-and-runs). Do not change runtime behavior or tests during healing. A new chat resolving a different profile uses that profile's defaults. Archive and delete replacements have no source chat and use resolved defaults.

## Consequences

This is provenance repair, not a claim that the maintainer directly selected every profile detail. Current pages settle routine reading, and historical bodies retain their original reasoning.
