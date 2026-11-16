# Components and lifecycle

This page owns target component declarations, dependencies, installation, and lifecycle mechanics. The coordinator accepts this technical design on 2026-11-15 under delegated architectural authority. [Decision 0083](../decisions/0083-components-removal-and-origin.md) owns the product meanings. [Profiles](../product/profiles.md) owns today's configuration and application behavior. No general component loader, physical removal, or restoration is shipped. This target serves CP-02, CP-09, CP-10, CP-15, CP-33, CP-34, and CP-36 in [the checkpoint](../checkpoint.md).

## Kinds and manifests

Everything outside [the kernel](kernel.md) is a component. Kinds describe contributions, not authorship or trust. A component can declare several contributions. Built-in and add-on are retired as kinds. Origin says who made a component, such as Independum, the user, or an MCP server. Installation source and verified signer are separate facts. Origin grants no authority or special integration path.

| Kind | Contribution |
| --- | --- |
| Tool | A definition and execution through [the universal tool contract](tools.md). Script is a tool. |
| Loop | Context, tool iteration, and continuation policy through [the loop contract](loop.md). |
| Stage | An observer or transformer at an explicit loop stage. Compaction is a loop stage using services. |
| Resource | Instructions, facts, skills, commands, attachments, and their exact resolved content. |
| Service | Permission decisions, execution, durable queues, background activities, and other brokered services. |

Component-specific editors and renderers are declared contributions and share their owning component's lifecycle. They do not introduce another privileged class. Generic screen, file, settings, and evidence mechanisms remain kernel responsibilities.

Every manifest declares:

- Stable identity, version, manifest version, purpose, and origin.
- Named contributions, their kinds, contract versions, effects, and dependencies.
- Entry point, runtime, complete executable closure, and requested capabilities.
- Settings schema and stable editable text identities with defaults and declared slots.
- Owned files, installation source, and restoration source or explicit absence.

Read and validate manifests without executing their entry points. Installation source identifies where bytes came from. A signer establishes only the verified signing identity. Neither replaces the permission decision. Diagnostic failures name the manifest, field location, component, and unmet requirement.

Slice 1 publishes the version 1.0 [manifest and captured setup schemas](../../packages/component-protocol/src/schemas.ts). Protocol fixtures use inert sample declarations. Graph resolution, loading, installation, and removal remain unimplemented.

## Dependencies and captured setup

Resolve each profile's graph to exact versions and artifact digests in a profile lock. Reject cycles, missing required dependencies, incompatible contracts, and conflicting contributions before new work. A lock records the resolved graph rather than silently choosing different bytes for the same version. Source packages declare the complete executable closure. A transitive executable change creates a new revision. Existing hook entry fingerprints alone do not establish that closure.

Capture the graph, settings, texts, resources, provenance, and configuration revision at request acquisition. Freeze that setup for the whole running reply, including its later turns and tools. Subsequent profile edits, file edits, detach, or removal affect the next request. Background activities retain their launch setup and ownership until settlement. New work cannot quietly borrow a running reply's old installation lease.

Invalid desired configuration blocks its dependent new work. Show the applied setup and pending invalid revision with precise reasons. Unrelated profiles remain usable. Dependency changes require an explicit reviewed change to the graph, not silent replacement or detachment.

## Detach and disk removal

Detach ends contributions in one profile while keeping the installation. It does not delete settings, historical evidence, or another profile's attachment. Removing an installation ends future contributions across affected profiles and deletes its files from disk. Settings deletion is a separate explicit operation.

Removal first prevents new acquisitions and identifies all affected profiles, dependencies, running replies, and owned activities. Never silently detach dependents. Present the dependency consequences and execute only the explicitly selected changes. If dependencies remain unresolved, dependent new work refuses with the exact reason.

Running replies retain leases and finish with their captured setup. Removal remains pending while leases or owned activities remain. Dispose instances and confirm actual process exit before deleting files. Report completion only after the bundle and its exclusively owned dependencies are deleted. Shared dependencies stay installed. A deletion failure remains a named incomplete removal, not a successful removal with hidden leftovers.

Keep no executable fallback archive or reinstall cache. Historical evidence retains inert manifests, schemas, texts, exact inputs, results, effects, revisions, and digests according to [record retention](kernel.md#durability-and-recovery). It does not function as an installed bundle. Settings retained after removal also confer no executable availability.

## Restoration

Official components download from a signed release index alongside Independum releases. Other components declare a publisher URL or importable archive. Pin the artifact digest and verify trusted signatures where available. Reject unsafe archive paths. Stage and validate the complete bundle and dependency graph, then install atomically without executing installation scripts.

Restore the recorded version and digest rather than substituting latest. Reinstallation keeps historical identity unchanged and does not rewrite captured evidence or silently attach a profile. Applying retained settings follows schema validation and the next-request boundary. Missing required dependencies block dependent work until restored or explicitly changed.

An unpublished user component needs an external saved copy to be restorable. An unavailable source or missing old artifact is a disclosed limitation before deletion, never an implied recovery promise. No hidden local executable copy compensates for it. The maintainer decides how removal first presents dependents, pending replies, and unavailable restoration when those slices are built.

## Historical inspection and verification

[Replies](../product/replies.md#removed-components) owns historical card meaning. Mark Removed in affected card headers and omit actions needing the missing component. Inspect captured values without running component code. A current editor or reinstalled version never substitutes for the historical object. Exact evidence and provenance remain available through generic kernel inspection and headless access.

Conformance covers manifest validation, dependency cycles and collisions, pinned closures, concurrent profile edits, request leases, cancellation and actual exit, Windows file deletion failures, shared dependency ownership, settings retention, missing restoration sources, unsafe archives, digest verification, atomic install recovery, and inspection after removal and reinstall. [The roadmap](../roadmap.md) separates loading, detach, physical removal, and restoration into landable slices. Protocol fixtures alone do not verify these lifecycle journeys.
