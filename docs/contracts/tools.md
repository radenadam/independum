# Universal tools and Script

This page owns the target universal tool definition, adapters, and Script execution. The coordinator accepts this technical design on 2026-11-15 under delegated architectural authority. [Decision 0084](../decisions/0084-universal-tools-and-script.md) owns the product requirements. [Tools](../product/tools.md) owns the six shipped tools. Only their direct Pi registration exists today. Slice 1 publishes version 1.0 [definition and execution schemas](../../packages/component-protocol/src/schemas.ts) with reference fixtures. Runtime integration, other adapters, and Script remain unimplemented. This target serves CP-07, CP-16, CP-17, CP-26, CP-27, CP-29, CP-30, and CP-32 in [the checkpoint](../checkpoint.md).

## Definition and execution

Every source supplies `ToolDefinitionV1` through [the component protocol](component-protocol.md). The model still receives ordinary tool declarations and emits tool calls. Origin identifies the maker without creating a separate internal path.

| Part | Contract |
| --- | --- |
| Identity | Stable tool identity, definition version and digest, owning component and contribution, and fixed exposed name. |
| Description | Editable description and exact declared text identities. |
| Parameters | Pinned JSON Schema dialect and exact parameter schema, including editable descriptions. Names, types, and structure stay fixed for that definition. |
| Execution | Brokered `tool.execute`, execution-order requirements, declared effects, and required permission and execution service handles. |
| Result | Model content, optional structured data with declared result schema, inert historical display details, and an error flag. Progress is separate. |
| Texts | Stable identities for descriptions, parameter descriptions, templates, owned failure wording, defaults, and declared slots. |

Capture the definition and effective texts with the request. Schema or name changes create a different definition and apply next request. Text editing, reset, disablement, changed-default handling, and source navigation use the same identities across screen, files, scripts, and code. Provider-required constraints remain visible and explained.

Validate the original arguments before any conversion. Validate every stage replacement against the same pinned definition without coercion, default insertion, or silent repair. Authorize the final exact arguments immediately before execution. An invalid value fails without tool effects and identifies each differing parameter, expected schema, and supplied value. Capture original, replacement, accepted, and denied values with their causes.

The path is declaration, exact call capture, validation, loop stages, final validation, authorization, execution, result stages, and recorded result. All sources and nested calls use that path. The loop owns scheduling and ordered results. An adapter translates representation without acquiring new policy authority or bypassing the broker. Cancellation, progress, thrown failures, uncertain effects, and terminal outcomes use the protocol contract. Never rerun completed effects automatically.

## Source adapters

| Source | Adapter responsibility |
| --- | --- |
| Independum tools | Preserve Read, Write, Edit, Shell, CheckCommand, and StopCommand behavior and existing evidence while migrating each separately. |
| Small scripts | Use the component runner with declared input, result, runtime, effects, and editable texts. |
| Command line programs | Declare executable and argument mapping, standard input mapping, output and error mapping, and execution requirements. |
| HTTP APIs | Declare request and response mapping, endpoint, authentication references, and requested network effects. Credentials stay outside model content. |
| MCP servers | Use standalone `pi-mcp` for discovery, calls, correlation, progress, cancellation, and OAuth. Translate discovered definitions and results into the same contract. |

MCP discovery is captured at the request boundary. Preserve original-to-exposed name mappings, source server identity, schemas, descriptions, and definition digests. Reject collisions rather than silently rename a conflicting exposed tool. Changed remote definitions apply to the next request. MCP is a source, while Script is a way to call tools, so neither replaces the other.

Map external results into model content, structured data, historical details, and errors without losing exact source evidence. Tool exposure or removal never erases invocation records. An unavailable adapter or dependency refuses explicitly instead of falling back to a broader execution path.

## Authority

Permission policy and execution are removable service components. Effects require their explicit capability handles. Absence or removal of either service cannot grant broader access. Keep [the existing permission contract](../product/permissions.md), including exact final arguments, denial of private state, readable other state, explicit approval for state and protected configuration writes, nested read-only protection, native project execution, and refusal without unrestricted fallback.

Adapters declare effects but declarations alone grant nothing. Worker and descendant enforcement remains in the existing native adapter. Trusted in-process components are outside that isolation guarantee and must say so. Model calls from tool implementations still pass through [the kernel](kernel.md), with the tool invocation as their recorded cause.

## Script

Script is a removable tool component. Its parameter is a short program calling exposed tools as functions. Use standalone `pi-codemode` with a fresh bounded QuickJS worker containing only injected tool functions. Bound time, memory, and output. There is no filesystem, network, or process access apart from injected capabilities.

Each profile exposes each tool directly, inside Script, or both. Direct exposure controls model declarations. Script exposure controls its injected function catalog. Disabled or detached tools are unavailable through both paths. Without Script installed and attached, Script-only tools do not silently become direct declarations. Record exposure choices and exact function-to-tool mappings with the request.

Nested calls from any source traverse the same validation, stages, permissions, execution, and evidence path as direct calls. Link each to its Script invocation. Capture progress, nested inputs and results, script output, errors, cancellation, and actual worker exit. Only script-produced output enters model context. Nested results remain inspectable evidence even when the script does not print them.

Cancellation settlement can precede worker exit. Do not release worker resources or component leases until actual exit. Script has the same detach, physical removal, restoration, and inert historical evidence rules as [other components](components.md).

## Verification

Conformance compares all sources on definitions, exact argument rejection, replacements, authorization, progress, errors, cancellation, result preservation, editable texts, and provenance. Script scenarios cover mixed-source nested calls, each exposure choice, unavailable services, bounded execution, stopping, removal, and retained evidence. Sample tool tests substitute recorded services without a model call or effects unless explicitly enabled. Passing adapter fixtures does not complete integrated screen, file, or headless control acceptance.
