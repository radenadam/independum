# Phone access through token auth

- Status: accepted
- Date: 2026-10-24

## Context

The maintainer wants to use Independum from a phone. The agent can run commands on the machine, so anyone who reaches the server controls the machine. Browsers also let any website send requests to `localhost`, so a local server without auth is open to every page the user visits.

## Decision

- The server listens on `127.0.0.1` by default.
- Every API request carries a secret token, on `localhost` too, and the server checks the `Host` and `Origin` headers.
- The token is new on every launch and exists only in the server's memory. The terminal prints it after the `#` of the link, a part that browsers never send to a server, and the UI keeps it until a new link replaces it.
- Phone access is opt-in. The user turns on network access, and the terminal shows a pairing link and QR code that carry the token.
- Access from outside the home network goes through a private network such as Tailscale, never through an exposed port.

## Consequences

- Restarting Independum signs out every browser and phone. Each one opens the new link, and a phone scans a new code.
- Until network access and phone pairing exist, the server stays on `127.0.0.1` and phone access is unavailable.
- The UI works on phone screens from the first screen.
