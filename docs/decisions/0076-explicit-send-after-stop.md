# Explicit send after Stop

- Status: accepted, amends [decision 0064](0064-queue-and-steer.md)
- Date: 2026-11-10
- Source: direct maintainer answer 7 to the healing proposal on 2026-11-10

## Context

The shipped slice holds all later prompts after Stop. Earlier delegated behavior was not a final maintainer preference. Stop also raises a distinction between visible partial output and later model input.

## Decision

Nothing already waiting sends automatically after Stop. The user explicitly releases waiting work through its send action. A newly explicit send goes without releasing older held messages.

When Stop cuts off thinking or a reply and Pi does not send that part to the model, tell the user that it is not sent. Preserve completed tool effects. First inspect exactly what Pi saves and sends after aborting so the disclosure states facts.

## Consequences

Do not change product behavior during healing. CP-18 and CP-19 remain partial and missing. Existing queue scenarios document shipped behavior and must change with the future implementation. [Message composition](../product/message-box.md#waiting-messages) distinguishes current behavior from this target.
