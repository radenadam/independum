# Kernel without harness decisions

- Status: accepted, amends [decision 0073](0073-component-removal-and-kernel.md) and [decision 0074](0074-optional-request-history.md)
- Date: 2026-11-15
- Source: direct maintainer acceptance of coordinator kernel judgment and exact recording requirements in the foundation conversation on 2026-11-15
- Kind: product requirement

## Context

Decision 0073 reserves conversation inside a chatbot kernel and leaves its detailed boundary pending. Sending earlier turns already chooses context, so that boundary retains harness policy. Optional default-off recording in decision 0074 also conflicts with exact, recorded, reproducible transparency.

## Decision

The kernel holds no harness decisions. It connects through Pi, makes one model call, records exactly what went in and came out, saves the record, and offers screen, files, and settings for engineering everything else.

Only the kernel calls a model. Every loop uses that doorway, so the inspector retains exact input and output regardless of the loop. Calls include ordinary work, retries, compaction, and warming. Required recording replaces optional default-off capture. Retention and explicit deletion controls from decision 0074 remain.

Earlier turns belong to context engineering in a component. With the loop removed, each message makes one exact model call without earlier turns. Explain this plainly on screen. A plain chatbot is the kernel plus a small chat loop component. The default profile includes a full agent loop.

## Consequences

This amends decision 0073's kernel boundary and completes its product question. "Down to a chatbot" remains an illustration, not the minimum architecture.

[The product definition](../product/README.md#parts-of-a-harness) owns the boundary. CP-03 owns reduction to the kernel, CP-05 inspection, and CP-06 records. Current last-payload storage, approximate matching, separate summaries, and warming counts do not satisfy it. No implementation or complete capture evidence is claimed.

Protocol encoding, persistence design, and retention mechanics are coordinator engineering work. They must preserve exactness rather than add hidden harness policy.
