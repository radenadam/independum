# Pi updates arrive as reviewed pull requests

- Status: accepted
- Date: 2026-10-25

## Context

Decisions 0002 and 0011 leave providers, logins, models, and the agent loop to Pi, so the maintainer never maintains provider or model compatibility. Pi's fixes and new models reach Independum only when its version is updated.

Pi follows semantic versioning from 1.0. `pnpm check` catches changes to the functions Independum calls, through the type check and the login tests. It cannot catch changes in behavior: browser sign-ins, real model calls, and Pi's own prompts and tools, which Independum shows to the user.

## Decision

- Dependabot checks each week for a new version of `@earendil-works/pi-coding-agent` and opens a pull request, as set in `.github/dependabot.yml`. Other dependencies are updated by hand.
- The pull request never merges by itself. The maintainer reviews it with an agent, following `AGENTS.md`, and merges it after approving.
- Independum never adds code for a single provider or model. When Pi lacks something or has a bug, Independum waits for a Pi release or reports the problem to Pi.

## Consequences

- Pi's fixes and new models reach Independum within a week of a release.
- Each update costs the maintainer a short review and one real model call.
- GitHub's dependency graph does not yet read the two-document lockfile that pnpm 12 writes, so GitHub raises no security alerts for this repository. Dependabot reads the lockfile itself, so version updates still work.
