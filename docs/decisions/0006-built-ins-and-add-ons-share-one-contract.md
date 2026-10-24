# Built-ins and add-ons share one contract

- Status: accepted
- Date: 2026-10-24

## Context

Every Independum feature is either a built-in, which ships with Independum, or an add-on, which the user adds. The user must be able to see and control an add-on exactly like a built-in. If built-ins used internal shortcuts that add-ons cannot use, add-ons would become second-class, and the UI could not treat both the same way.

## Decision

Built-ins and add-ons use one contract. The UI shows both the same way and labels each by its origin. The project uses one word for features the user adds, "add-on", so that no second word such as "plugin" or "extension" competes with it. What the contract contains is an open question in `docs/roadmap.md`.

## Consequences

- Building each built-in exercises the shared contract, so gaps in it show up early.
- Harness code does not reach into the internals of any built-in or add-on.
