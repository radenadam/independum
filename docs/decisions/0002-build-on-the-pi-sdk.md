# Build on the Pi SDK

- Status: accepted
- Date: 2026-10-24

## Context

The agent loop, provider integrations, and login with subscriptions or API keys are large problems that Pi already solves. Independum's value is transparency and control over the harness, not the loop itself.

## Decision

Independum uses the Pi SDK, published as `@earendil-works/pi-coding-agent`. Independum owns everything the user sees and controls: the system prompt, injected messages, instruction files, and tools.

## Consequences

- Each Pi default that Independum exposes, such as its system prompt, tools, and instruction file discovery, must be replaceable. Otherwise Independum cannot keep its promise.
- The SDK documents a replaceable tool set, a custom resource loader for instruction files and skills, and event streaming. Full ownership of the system prompt and of the context before each model call is not yet confirmed. The spike in `docs/roadmap.md` confirms it before `packages/core` starts, and revisits this decision if Pi falls short.
