# First providers and development models

- Status: accepted
- Date: 2026-10-24

## Context

Independum needs real model calls to verify its use of Pi, and later to develop and test features. The maintainer has an Anthropic API key with monthly credit and a ChatGPT subscription. The two providers use different endpoints and login methods, so together they cover both kinds of access that Pi supports.

## Decision

- Anthropic comes first through an API key, and ChatGPT comes first through the subscription login of Pi's `openai` provider, labeled "Sign in with ChatGPT". Pi 1.4.0 marks the older `openai-codex` provider as legacy.
- During development, real model calls use only `claude-haiku-5-5` for Anthropic and `gpt-6-luna` for ChatGPT, because they are the cheapest models the maintainer approved.
- The maintainer logs in through the login screen, like any user, so development logins live in `~/.independum`. Experiments load them through Pi, never from a file in the repository. Decision 0008 retired the earlier `.env` file.

## Consequences

- Agents never read the login files in `~/.independum`, which are `auth.json` and `models.json`, so keys stay out of conversations. Claude Code enforces this through `.claude/settings.json`.
- Agents may read chats in `~/.independum/sessions` to debug them, because chats hold no credentials.
- `pnpm check` never calls a real model, so it runs without credentials and costs nothing.
- Other providers wait until a later decision.
