# One server for the UI and the API

- Status: accepted
- Date: 2026-10-24

## Context

In development, the UI ran on the Vite dev server and the API on the `independum` server, each on its own port. Two ports mean two origins. That complicates the access token checks from decision 0005, needs a proxy between the two, and gives the user two addresses.

## Decision

The `independum` server serves the UI and the API on one port, `4870`, in development and in production. Requests under `/api/` go to the Hono app. In development, every other request goes to Vite in middleware mode, which compiles the UI and reloads it live. Serving the built UI files in production comes with packaging.

## Consequences

- The browser sees one origin, so the server can accept API requests from its own origin only.
- The terminal prints one link, and `pnpm dev` runs one process.
