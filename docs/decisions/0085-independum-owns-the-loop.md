# Independum owns the loop

- Status: accepted, partly supersedes [decision 0002](0002-build-on-the-pi-sdk.md) and [decision 0012](0012-pi-updates-arrive-as-reviewed-pull-requests.md), amends [decision 0072](0072-editable-pi-texts.md), [decision 0062](0062-project-resources-and-context-controls.md), [decision 0064](0064-queue-and-steer.md), and [decision 0068](0068-message-attachments.md)
- Date: 2026-11-15
- Source: direct maintainer product answers in the foundation conversation on 2026-11-15
- Kind: product requirement

## Context

Pi currently owns the agent loop. Hooks offer selected seams but cannot let a user engineer the whole loop. The foundation's checkpoint summary considers keeping Pi's loop or owning it. Its settled loop and kernel answers resolve that alternative in favor of Independum ownership.

## Decision

Independum owns the loop as a replaceable component. It runs requested tools, sends back results, and repeats until done. Engineer it at every depth: screen controls, stages in files, a small script, or a full component in code. Hook events become stages of Independum's own loop.

Only the kernel calls the model and records exact input and output under [decision 0082](0082-kernel-without-harness-decisions.md). Replacing a loop never bypasses that capture. Context assembly, including earlier turns, remains outside the kernel.

Pi keeps providers, logins, and models. Continue using Pi for those responsibilities without provider-specific compatibility code. Existing session-format ownership is unchanged by this decision. Pi's update and narrow text-patch rules remain.

## Consequences

This partly supersedes decisions 0002 and 0012 only for loop ownership. It changes the future integration boundary of context, queues, and attachments in decisions 0062, 0064, and 0068. Their durable data and user behavior promises remain.

Keeping Pi's loop as the sole fixed engine is rejected because engineering every part is the product. The current Pi loop remains implementation until replacement is built and verified. CP-28 owns that gap. [Hooks](../product/hooks.md#loop-target) distinguishes current callbacks from the target stages.

The next contract work defines stages, cancellation, settlement, replacement, and exact kernel-call conformance. It must preserve completed tool effects, durable waiting inputs, permissions, and running-reply configuration.
