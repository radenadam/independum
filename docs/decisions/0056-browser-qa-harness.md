# Browser QA harness

- Status: accepted, with its direct driver replaced through [decision 0071](0071-repository-healing.md)
- Date: 2026-11-05

## Context

The coordinator checks changes in the running app with private preview and browser scripts. Other contributors need the same capability in the repository, with repeatable scenarios and evidence that stays outside it.

## Decision

- `pnpm preview` starts the UI and API with Pi's stand-in provider in a fresh temporary home. Flags choose the fixture, optional real logins through Pi, and the port.
- `pnpm qa <scenario>` finds an installed Chromium browser and drives it through the Chrome DevTools protocol. It accepts the scratch driver's step fields and records screenshots, returned values, and browser diagnostics in the system temporary directory.
- The `qa` folder holds short JSON scenarios for the core flows. The harness lives beside the server code so it uses existing dependencies. Node's WebSocket connects to the browser without another package.
- Every change a user sees is checked with the relevant scenarios and screenshot review. `pnpm check` validates code, fixtures, and scenarios without starting a browser or calling a real model.

## Consequences

- A contributor needs an installed Edge, Chrome, or Chromium browser for browser QA.
- Fixtures use Pi's session API, including saved compaction entries. The harness never reads or copies credential file contents itself.
- The development command and preview share the same server startup, so token and origin checks stay in one place.
