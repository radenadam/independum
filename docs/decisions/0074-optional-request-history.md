# Optional request history

- Status: accepted, amends [decision 0034](0034-texts-of-pi.md), [decision 0048](0048-session-place.md), and [decision 0053](0053-documented-behavior-and-limits.md)
- Date: 2026-11-10
- Source: direct maintainer answer 3 to the healing proposal on 2026-11-10

## Context

Last-request storage and reconstructed assistant history cannot establish a complete record of provider calls. Complete retention can also impose performance and storage costs.

## Decision

Full request retention is off by default because Independum defaults to performance. Let the user enable retention of every ordinary request, retry, compaction request, and cache warming request, together with the settings each used. Offer retention controls and explicit deletion. Label incomplete captures.

## Consequences

The present last payload, separate summary captures, and warming counts remain partial implementation. Default-off history does not excuse inaccurate live inspection. CP-05 and CP-06 keep these requirements separate. [Server storage](../product/server.md#storage) describes what ships.
