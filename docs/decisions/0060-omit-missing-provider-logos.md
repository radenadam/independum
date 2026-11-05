# Omit missing provider logos

- Status: accepted
- Date: 2026-11-05

## Context

Decision 0016 reserves a logo slot in lists even when no logo matches the provider. The stand-in login makes that empty slot visible in Settings. The maintainer asks for nothing in place of a logo that a provider lacks.

## Decision

- A provider without a matching logo renders no logo and reserves no space for one.
- Apply this to saved logins, provider choices, and model groups.

## Consequences

- This amends the logo slot rule of [decision 0016](0016-working-screen.md).
- Provider names remain readable whether or not a logo matches.
