# Stay in TypeScript

- Status: accepted, amends [decision 0003](0003-typescript-monorepo-on-node.md)
- Date: 2026-11-15
- Source: direct maintainer product and implementation answers in the foundation conversation on 2026-11-15
- Kind: implementation choice

## Context

A Rust rewrite and an Independum-owned provider layer are alternatives to the current TypeScript and Pi stack. Language choice alone does not determine how many agents can run concurrently. Model calls and tools dominate an agent's time, and the run model governs concurrency.

## Decision

Keep Independum in TypeScript. Pi continues to own providers, logins, and models. The language-neutral component protocol permits components in other languages while TypeScript stays the easiest path.

A Rust rewrite, including an owned provider layer, is only a possibility to reconsider after shipping, once people use Independum. It is not checkpoint architecture or scheduled rewrite work.

## Consequences

This reaffirms the stack of decision 0003 under the settled foundation. Current Node and package conventions remain. Loop ownership changes separately in [decision 0085](0085-independum-owns-the-loop.md).

The coordinator engineers run lifetimes and concurrency against actual behavior rather than treating a language rewrite as a scaling prerequisite. [The product definition](../product/README.md) states the boundary. No code change follows from this context reconciliation.
