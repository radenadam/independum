# Phone access with device pairing

- Status: accepted, with remaining checkpoint work in `docs/roadmap.md`
- Date: 2026-11-06

## Context

Decision 0005 plans phone access with a QR code that carries the launch token. Sharing that token prevents revoking one lost phone independently. Plain HTTP also exposes credentials and application traffic to network attackers.

Decision 0058 gives each client its own chat selection. Decision 0066 gives local clients private discovery and control authority. Phone access uses the existing chat services without sharing that local credential. Pi owns those chats but offers no browser pairing or harness listener service.

The maintainer approves the phone proposal with one change. A paired browser stays paired across launches until revoked. A browser cannot establish certificate trust from a pairing link alone.

## Decision

- Phone access starts off on every launch. Only local authenticated controls enable it.
- The existing control listener stays on loopback. A separate phone listener binds one explicitly selected current private address, with IPv6-only binding for a selected ULA, or a dedicated IPv4 loopback proxy backend. Wildcard, public, and unavailable addresses never cause a fallback.
- Phones require trusted HTTPS. Plain HTTP is permitted only between a local HTTPS proxy and its exact loopback backend. The proxy uses the configured external HTTPS origin and backend Host. Forwarded headers establish no authority.
- Direct HTTPS accepts supplied PEM certificates and keys and checks validity and the exact hostname or address. Independum installs no trust roots and issues no certificates. The phone must already trust the issuer.
- Private routes belong to the user. Independum installs no VPN, changes no firewall, forwards no router port, and supports no public exposure. Registering an origin does not verify its privacy.
- An invitation contains at least 256 random bits in its fragment. It expires after two minutes and permits one atomic claim. A separate random receipt identifies that pending claimant. Replacement, cancellation, disablement, and restart invalidate pending attempts.
- Both screens show a six-digit comparison code. Only the computer can approve that exact request and code before expiry. Claiming an invitation grants no application access.
- Each approved browser receives its own random credential. Only its hash persists, in `runtime/phones.json` with the account-only ownership and permission checks of decision 0066. Pairings survive restarts and disablement until revoked. The browser stores its own credential and sends it in the authorization header.
- The owner lists names, pairing times, and last authenticated activity and can rename or revoke each browser or revoke all. Phones can only rename and disconnect themselves. Names are client-supplied labels, not verified hardware identities.
- Revocation closes that credential's established responses and rejects later requests. Disablement closes all phone connections and invalidates pending attempts but preserves saved pairings. Neither action cancels accepted chat work.
- Pairing state holds at most one invitation and claimant. A minute permits 20 claim or invalid receipt attempts. The registry permits 16 browsers. Names contain 1 to 80 characters without control characters.
- Every API route stays under `/api/`. Exact authority checks also protect the phone UI. Supplied origins match the configured HTTPS origin exactly, including scheme and port. Missing origins retain the allowance of decision 0053. Phone, receipt, invitation, and local credentials have separate purposes. A loopback proxy peer never gains local control authority.
- The phone listener serves the built UI. Vite and development reload endpoints stay on the local listener. Development, preview, and QA build the phone UI before starting.
- Pair a device in Settings shows a locally generated QR code beside the copyable invitation address and expiry. The SVG is returned only through the locally authenticated invitation response, with black modules, a white background, and a four-module quiet zone in both themes. No phone route serves the invitation image.
- The explicit `phone pair` command requires an interactive local terminal. It shows the invitation address and a character QR code, waits for a phone request, and approves only after the user types the matching code. Cancellation targets that invitation's id, so it cannot cancel a replacement. No phone credential or invitation enters terminal status, ordinary output, model context, or logs.

## Consequences

This amends decisions 0005, 0010, 0058, and 0066. Earlier records link this amendment. Local control tokens still rotate on launch, independently of phone credentials.

A lost phone can lose access without signing out other devices. Private transport setup precedes pairing. Learners can choose a private HTTPS route without managing phone certificate trust. A paired browser can drive the agent and its tools, so this adds no user isolation.

The harness adds transport, scoped authentication, account-only phone persistence, and connection revocation because Pi does not own those services. Existing Pi chat services retain submission, reconnection, and independent chat selection.

Browser QA uses isolated owner and phone browser profiles and a local HTTPS fixture whose public test certificate is pinned only inside QA. Real phone certificate trust, camera scanning, and supported host firewall behavior require native checks before the checkpoint is complete.
