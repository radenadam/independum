# Universal tools and Script

- Status: accepted, amends [decision 0029](0029-own-tools.md)
- Date: 2026-11-15
- Source: direct maintainer product answers in the foundation conversation on 2026-11-15, with the language-neutral protocol delegated to the coordinator that day
- Kind: product requirement and delegated implementation choice

## Context

Independum's own tools currently register directly with Pi. Leaving MCP, scripts, programs, and APIs as separate tool kinds would preserve internal shortcuts. MCP and script mode also answer different questions.

## Decision

One universal tool contract supplies name, description, parameters, execution, and editable texts. Independum tools such as Read and Shell use the same doorway as a small script, MCP server, command line program, or HTTP API. The kernel and component boundary follows [decision 0083](0083-components-removal-and-origin.md). Its language-neutral protocol permits implementations in any language.

This doorway controls how a tool is added. It does not change the model's ordinary view of a tool list and tool calls.

Script mode is itself a tool component. Its parameter is a short program in which other tools are functions. It can call tools from every source. MCP is one source of tools, so MCP and Script coexist.

Each profile chooses whether each tool is exposed directly, within Script, or both. Script has the same removable lifecycle and inspection promise as other components. No second execution path bypasses permissions or exact evidence.

## Consequences

[Tools](../product/tools.md#universal-tool-contract) owns the target. CP-26 tracks the shared contract and sources, CP-27 Script and exposure. The six existing tools retain their behavior until migrated. Direct Pi registration is partial machinery, not universal contract support.

This amends decision 0029's registration boundary, preserving its carefully planned tools, factual descriptions, exact calls, and Pi provider compatibility. Specific protocol messages, adapters, and script execution design belong to the next engineering step.
