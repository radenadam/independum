# Control parity and newcomer journeys

- Status: accepted, amends [decision 0006](0006-built-ins-and-add-ons-share-one-contract.md), [decision 0048](0048-session-place.md), [decision 0061](0061-profiles-and-plain-settings.md), [decision 0065](0065-script-hooks-and-the-add-on-contract.md), and [decision 0066](0066-headless-mode.md)
- Date: 2026-11-10
- Source: direct maintainer answers 4, 5, and 6 to the healing proposal on 2026-11-10

## Context

An endpoint or raw configuration editor does not complete an understandable user journey. The three promised controls need one scope without making transient screen mechanics artificial APIs.

## Decision

Parity covers settings, the user's work, and everything the agent does. Open menus, hover, selection, and folded sections remain screen mechanics. Record borderline cases when they arise.

New tool logic may require code. Finding, installing, configuring, inspecting, disabling, and removing tools work through all three controls. Decide tool source editing on screen later.

Judge the redesign through the seven journeys owned by [design](../design.md#journeys). Refine expected newcomer understanding with the maintainer as each approaches.

## Consequences

Extended learning material remains later, but basic usability is part of technical readiness. Hook authoring, profile deletion, resource creation, and complete headless control remain acceptance gaps. Passing scenarios for existing controls does not establish newcomer comprehension.
