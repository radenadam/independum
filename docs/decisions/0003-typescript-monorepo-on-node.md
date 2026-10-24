# TypeScript monorepo on Node.js

- Status: accepted
- Date: 2026-10-24

## Context

Independum must be fast, lightweight, and run on Windows, macOS, and Linux. Pi is a TypeScript library that requires Node.js 22.19 or newer. Contributors work mostly through coding agents, so the stack must be one that agents write consistently.

## Decision

- TypeScript everywhere, on Node.js 22.19 or newer.
- pnpm workspaces: fast installs, and strict dependencies that prevent a package from using what it does not declare.
- `packages/independum`: the `independum` command and the local server, built on Hono, a small and fast server framework based on web standards.
- `packages/web`: the browser UI, built with React and Vite. React is the UI framework coding agents write most consistently. Its size does not affect install size, because the UI ships as prebuilt static files.
- `packages/core` joins after the Pi spike. It holds the harness logic and no UI, so a future desktop app can reuse it.
- Node.js runs TypeScript directly by stripping types, so scripts and the dev server need no build step.

## Consequences

- Code uses only erasable TypeScript syntax: no enums, namespaces, or parameter properties.
- A package folder is named after its package, without the `@independum/` scope.
