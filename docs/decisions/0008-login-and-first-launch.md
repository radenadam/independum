# Login and first launch

- Status: accepted
- Date: 2026-10-24

## Context

A user needs a login before the agent can chat, and Independum promises that the user can see and manage everything, credentials included. Development uses `.env` for now, but users must never need a file or a terminal to log in.

## Decision

- The first launch greets the user with two choices. "Get started" opens the login screen. "Just look around" opens the app without a login, so the user can inspect every part of the harness before trusting it with a key. The chat then asks the user to connect a model.
- The login screen lists every provider Pi supports, with the methods each one offers: account sign-in through the browser or a device code, and API keys.
- Choosing a provider shows its sign-in options beside the list on wide screens, starting level with the first row of the list and staying in view while the list scrolls. On phones, the options open as a sheet. Either way, the result of the click is visible at once.
- The user can add, change, and remove logins in the UI at any time. Features that need another model, such as classification, pick from the providers the user has logged in to.
- Logins live in `~/.independum`, a folder Independum owns, separate from Pi's `~/.pi`.
- The server access token from decision 0005 comes before the login screen, because the login screen accepts API keys.

## Consequences

- Returning users skip the greeting and land in the app.
- Once the login screen works, `.env` retires, and decision 0007 is updated to match.
