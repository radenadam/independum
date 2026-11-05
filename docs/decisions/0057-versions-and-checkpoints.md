# Versions and checkpoints

- Status: accepted
- Date: 2026-11-05

## Context

The maintainer called the current goal the v1 checkpoint: Independum with everything it promises, such as control over the context, profiles, hooks, permissions, and a headless mode, but with only the tools it has today. More checkpoints follow before Independum is shared, each adding tools, mostly as add-ons. Calling each one v1 would blur them, and the version that Independum tells the model was 0.0.0. The maintainer left the naming and the timing of packaging to the agent, and does not plan to share Independum before it is complete.

## Decision

- Independum follows semantic versioning. Version 1.0.0 is the first public release, when Independum is complete and ready to share.
- Each checkpoint before it is a minor version below 1.0. The current one is 0.5, everything Independum promises with today's tools. Later checkpoints, from 0.6 on, add tools toward 1.0.
- While work toward a checkpoint goes on, the packages carry its version with the `-dev` suffix, such as `0.5.0-dev`, so the version that the model and the user see is never wrong. Finishing the checkpoint sets the version without the suffix.
- Packaging for npm comes with the 1.0 release, because nobody installs Independum before it. Until then, Independum runs from the repository with `pnpm dev`.

## Consequences

- Both packages carry version `0.5.0-dev`.
- The roadmap names the 0.5 checkpoint as current work, and packaging as work for 1.0.
