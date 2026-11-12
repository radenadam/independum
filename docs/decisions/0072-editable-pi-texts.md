# Editable Pi texts

- Status: accepted, amends [decision 0002](0002-build-on-the-pi-sdk.md), [decision 0012](0012-pi-updates-arrive-as-reviewed-pull-requests.md), [decision 0033](0033-model-texts.md), [decision 0034](0034-texts-of-pi.md), and [decision 0062](0062-project-resources-and-context-controls.md)
- Date: 2026-11-10
- Source: direct maintainer instruction on 2026-11-09 and patch approval recorded in the healing plan on 2026-11-10

## Context

Pi wording was temporarily read-only. Waiting for upstream omission APIs leaves the product control promise incomplete. A required protocol structure and chosen wording are different constraints.

## Decision

Make Pi-owned model text editable through a small `pnpm patch`. This reverses the upstream-only restriction of decision 0012 for this purpose. Provider-imposed content stays visible and explained. Preserve existing model-text identities, resets, and changed-default handling. Unsupported control fails explicitly.

Pi still owns providers, authentication, model catalogs, capability adjustment, and the agent loop. Do not add single-provider compatibility branches or a payload transformer as a substitute. Keep reviewed Pi updates and revalidate the patch when updating.

## Consequences

The patch and its full text inventory remain unfinished checkpoint work. Shipped read-only limitations are documented as gaps, not the final policy. [Context](../product/context.md#requests-and-pi) owns current implementation.
