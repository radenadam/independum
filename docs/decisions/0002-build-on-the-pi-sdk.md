# Build on the Pi SDK

- Status: accepted
- Date: 2026-10-24

## Context

The agent loop, provider integrations, and login with subscriptions or API keys are large problems that Pi already solves. Independum's value is transparency and control over the harness, not the loop itself.

## Decision

Independum uses the Pi SDK, published as `@earendil-works/pi-coding-agent`. Independum owns everything the user sees and controls: the system prompt, injected messages, instruction files, and tools.

## Consequences

- A spike with `claude-haiku-5-5` and Pi 1.4.0 confirmed the seams Independum needs. A `DefaultResourceLoader` with `systemPrompt` and `noContextFiles` replaces Pi's prompt and resource discovery. `noTools: "builtin"` with `customTools` replaces the tool set. The `context` hook adds messages before every model call. The `tool_call` hook blocks a tool before it runs. `session.subscribe` streams every step.
- Pi adds content that the user would not see: a `<cwd>` block appended to the system prompt, a hidden `__pi_deferred_placeholder__` tool, and its own thinking display, effort, beta, and output limit settings.
- The `before_provider_request` hook receives the exact request body and can replace it. Removing the `<cwd>` block and the placeholder tool there worked, and the model behaved the same.
- Independum shows the user the final request exactly as sent, so nothing reaches the model unseen. Each Pi addition becomes a built-in that the user can see and turn off, or Independum removes it.
- A second spike with `gpt-6-luna`, through the "Sign in with ChatGPT" login of the `openai` provider, confirmed the same seams: the system prompt, the `context` hook, the `tool_call` hook, and the event stream.
- The request shape depends on the provider. For ChatGPT, the system prompt travels as a developer message with the `<cwd>` block appended, the tools travel as an `additional_tools` item in `input`, and Pi adds no placeholder tool. Removing a Pi addition in `before_provider_request` therefore needs code for each provider, which decision 0012 rules out.
