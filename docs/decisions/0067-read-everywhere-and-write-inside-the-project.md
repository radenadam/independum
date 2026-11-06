# Read everywhere and write inside the project

- Status: accepted, amends [decision 0063](0063-permissions-and-enforced-tool-access.md)
- Date: 2026-11-06

## Context

On the maintainer's Windows machine, a Node program run by path inside MXC fails with `EPERM` while inspecting the drive root. Node's JavaScript realpath checks that root before loading the script. MXC grants a folder with its descendants, so granting only the runtime and project folders cannot permit this check. This blocks Node scripts, npm, pnpm, Vitest, and script hooks. A file worker preload avoids the check for that worker alone and changes module resolution.

The maintainer measures a read-only drive root together with a writable project and a denied folder. A Node script runs, the denied folder refuses reads, and writes outside the project fail. Each command takes about one second. The maintainer chooses system reads with project writes as the default boundary.

## Decision

- Project mode lets commands and file tools read everywhere except denied paths. Writes outside the project and network access need approval unless policy allows them. Rules still precede default grants. A saved read rule can still require approval or deny access.
- Independum's state folder, normally `~/.independum`, is always denied to project commands and file tools because it holds the logins. Neither saved approvals nor allow rules open it. Profiles can deny more paths through their existing rules. Unrestricted mode keeps its explicit account authority.
- The native adapter grants every available drive root read-only on Windows and `/` on macOS and Linux. Writes remain limited to the project and explicit grants. Project `.independum` remains readable through nested read-only protection unless a write is explicitly approved.
- Startup access requires no approval. Remove its approval lifetime, saved records, cards, and Session controls. Permission policy version 2 removes `runtimeApprovals`. Validate version 1 before migration and preserve its remaining settings, rules, and resource approvals. Migrate user and known project profiles through the existing conditional configuration transaction. Profiles encountered later also normalize when read and save version 2 on their next write.
- Keep the sandbox runtime identity to invalidate pending operations when their engine, executable, or read roots change. That identity grants no authority and has no approval of its own.
- The editable permission fact names the exact denied paths and says that Linux shows each denied folder as an empty private mount. That view is not its actual content. Writes into a denied folder stay inside that command and disappear when it ends without reaching the host folder. The fact gives no advice. Session and approval details show the same boundary. Switching the fact off changes only context.
- Linux project tools run with MXC's denied folder masks. MXC 1.0.1 creates writable private mounts and V1 exposes no setting to make them read-only. An exact read-only grant does not change the mount because MXC resolves it to the stronger denial. Denied files and missing denied paths still refuse because successful empty file content would be false evidence. Other policies that cannot be enforced still refuse before execution.
- File workers use ordinary Node module loading. Remove symlink preservation flags and the realpath preload because system reads make them unnecessary. Pi retains tool execution, cancellation, image handling, and the mutation queue. The local adapter remains necessary because Pi offers no native sandbox boundary.

## Consequences

- Default reads outside the project need no approval in Read or context discovery. The project and network approval lifetimes remain unchanged.
- Programs can read installation paths and run scripts normally on Windows. They cannot read the state folder, write outside their granted paths, or reach the network without authority.
- Linux project tools remain available because the permission fact describes the writable private mask. The mask does not expose or change the host folder. Native regression coverage runs through the adapter and checks unchanged host contents and absent new host files on every system. Linux coverage also checks that private writes disappear between commands. A read-only mask remains an MXC request on the roadmap so the fact can become a plain denial.
- Native regression coverage includes a Node script run by path, outside reads, outside writes, denied state contents, nested read-only project settings, and file worker results without a preload. Tests skip only when native sandbox support or setup is unavailable.
- The detached descendant test inherits already opened standard streams because ignored streams require opening `/dev/null`, which a read-only root policy can block. It verifies a project completion file from the child as well as the outside host sentinels, so a child that never runs cannot pass.
- This replaces the startup approval and overlapping folder denial refusal in decision 0063. Its other enforcement, approval binding, and lifecycle choices remain in effect.
