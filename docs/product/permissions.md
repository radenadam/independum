# Permissions

Decision: [0063](../decisions/0063-permissions-and-enforced-tool-access.md). Permission rules authorize resources, approvals record a user's decision, and the sandbox enforces tool access while programs run.

## Policy and environment

The selected [profile](profiles.md) holds `settings.permissions` in `profile.json`. Missing policy uses `builtInPermissions` in [permission-policy.ts](../../packages/independum/src/permission-policy.ts). A supplied policy must be complete. It has `version`, `mode`, `environment`, `runtimeApprovals`, `savedApprovals`, and `rules`. Unknown fields, duplicate rule or approval ids, unsupported versions, and malformed resources fail strict profile validation. Invalid configuration never selects broader defaults.

Mode is `project` or `unrestricted`. Environment is `minimal` or `inherit`. Unrestricted mode requires an empty rule list. A runtime record has `backend`, `runtimeHash`, and `approvedAt`, and belongs to the profile across projects. A saved approval has `id`, `project`, `resource`, `identity`, and `approvedAt`. Its identity binds the exact access, canonical path, and existing ancestor metadata. A rule has `id`, `effect`, `project`, and `resource`. Effect is `allow`, `ask`, or `deny`. Project is an absolute project path or `*` for rules. A path resource has `kind: "path"`, `path`, `scope` of `file` or `tree`, and `access` of `read` or `write`. A network resource contains only `kind: "network"`. Paths do not expand environment variables, tilde, patterns, or regular expressions.

Rules match canonical paths by component. Deny precedes ask, which precedes allow. The fallback allows project files and asks for outside paths and network access. A protected configuration write requires an explicit approval even when an allow rule matches. The chosen approval lifetime applies to that exact resource and identity. A missing target resolves through its nearest existing ancestor. New file creation can require that whole parent tree, and the approval shows it. UNC paths also require network authority. File tools reject device paths, alternate data streams, unsafe Windows suffix aliases, folders, and known hard links.

Project and resource comparisons resolve both paths to their real locations, including directory junctions, Windows short names, and linked temporary folders. Approval previews, saved grants, and the project display keep the supplied path spelling. Native requests use canonical locations captured before approval. File fingerprints also use canonical locations because their paths identify files across aliases.

The exact minimal environment names are published by [command-environment.ts](../../packages/independum/src/command-environment.ts) and shown in Session. Explicit Shell variables apply after inheritance. The access token is removed last. File workers use minimal inheritance without profile variables. No outside writable temporary directory is granted automatically.

## Enforcement and runtime acceptance

[create-sandbox.ts](../../packages/independum/src/create-sandbox.ts) owns native launches. It uses only `@microsoft/mxc-sdk/v1`, selects a concrete backend, and disables operation telemetry. Windows requires the BaseContainer tier and permits UI startup while denying clipboard and input injection. The runtime manifest lists explicit installation reads, platform support facts, implicit platform baseline access, environment names and policy, and a hash bound to executable identity.

Project shell discovery does not execute a host version query because an executable in a writable project could run before authorization. The Shell description states that its version is not queried. Authorized version discovery through the adapter remains on the roadmap.

Session shows separate Shell and file-tool startup permissions, with their readable folders and operating system access. Allow for every chat of the profile records the backend, hash, and time through the existing conditional profile save. The same profile and engine reuse that approval wherever the exact baseline matches. A changed baseline asks again. Allow once accepts only the current operation without saving the baseline.

[permission-tool.ts](../../packages/independum/src/permission-tool.ts) validates final arguments again at execution. Shell receives only its project baseline and explicitly requested `access.paths` and `access.network`. Network authority is coarse and includes outbound, inbound, and host loopback access. No command text analysis or automatic retry expands access.

The adapter starts [run-file-operation.ts](../../packages/independum/src/run-file-operation.ts) for Read, Write, and Edit. The worker receives no session file, access token, login, or parent control channel. It reuses the existing file tools and returns their fingerprints, diffs, images, and text. The parent keeps Pi's per-file mutation queue and supplies previous fingerprints without previous tool content. CheckCommand and StopCommand keep their chat ownership checks and require no new resource grant.

The worker starts with both Node symlink preservation flags and preloads [file-worker-resolver.ts](../../packages/independum/src/file-worker-resolver.ts). The resolver uses native realpath after Node resolves each file module, so pnpm packages find their dependencies by their physical paths. JavaScript realpath does not probe the Windows drive root, and the runtime grants remain unchanged. The preload also applies to Pi's image worker.

Context resource discovery uses the same rule evaluator and approval store. File reads request file scope and directory discovery requests tree scope. Context approvals contain the path and operation, without a worker runtime because discovery runs in the server. Pending decisions bind the chat branch, profile revision, and canonical identity. They offer the same explicit lifetimes as tool access. Source edits require a separate write grant.

## Approvals and API

Messages select `approvalMode: "browser"` to permit waiting for a decision. The UI sends that choice explicitly. API messages default to `headless`, even while a browser follows the chat, and unmet tool approval returns an error result with `details.outcome: "approvalRequired"` immediately. Waiting progress includes an `approval` object, so the normal chat state snapshot restores it on reconnect. The request names its profile. The card heading names the requested kinds of access, such as Startup access or Network access. The card states each reason and requested resource, shows a Shell command as the step shows it, and puts all granted access behind a disclosure. Startup folders appear only while startup access is part of the request. A denial returns an error result with `details.outcome: "denied"`, and its step reads Denied in the quiet tone because the user chose it. Disconnecting a browser does not change an explicitly selected browser approval workflow.

Every card lists its choices narrowest first, in one look, so none reads as the default. Startup access offers Allow once, Allow for every chat of the named profile, and Deny. Path and network approvals offer Allow once, Allow for this chat, Always for this project, and Deny. Chat access stays in memory for that chat until the server stops, and binds the profile configuration. Project access saves the exact resource and identity in the profile for that project. Both saved choices also save a pending startup approval, as the card explains. A saved grant never adds access that a command does not request, and deny rules still win. Replaced identities need approval again. A save failure leaves the operation waiting with no new access. Concurrent identical answers share one save, and conflicting lifetimes return 409.

The Permissions detail shows the mode, the exact command environment name list, program startup permissions, every saved approval with its saved time and a removal action, saved rules, and protected settings folders. Paths use the separators of the system, although the profile file stores forward slashes. Choosing unrestricted mode asks for confirmation first, and choosing project mode does not. The exact saved profile file is behind File as saved. Removing a grant affects new operations and does not stop running programs. Pending decisions use a configuration binding that excludes approval records, so saving a decision does not invalidate itself. Other profile edits still invalidate it. The conditional file revision and a final check inside the configuration lock protect each persistent save.

The approval binds the copied input, tool call, chat branch, resource identities, profile revision, and runtime hash. Policy watches invalidate waiting requests. The same facts are checked immediately before execution. Stopping a reply aborts waiting. Changing chats does not stop another chat. Pi custom entries record decisions, and completed result details retain permission metadata. Restart discards pending decisions and never replays an operation.

| Method and path | Contract |
| --- | --- |
| `GET /api/approvals?chatId=...` | Pending requests, optionally filtered by chat. |
| `POST /api/approvals/:id` | `{ revision, decision, persistence }`, where decision is `allow` or `deny`, and persistence is `once`, `chat`, `project`, or `runtime`. Deny requires `once`. The request lists its available lifetimes. Returns 200, 400 for invalid data or an unavailable lifetime, 404 for an unknown request, and 409 for stale or conflicting state. |
| `DELETE /api/chats/:id/permissions/:approvalId` | Removes an approval owned by that chat, or returns 404. |
| Profile routes | Inspect, validate, reload, and conditionally save policy through the existing [profile API](profiles.md#api). |

The existing authenticated API protects these routes with its token, host, and origin checks. No approval creates a synthetic user message. Permission context and result templates are editable model texts in the Permissions group. Their fact switches change context only.

## Current limits

- Shell protects configuration with nested read-only grants on every system. Existing contents remain readable and writes fail. The adapter creates the project `.independum` directory before compiling its read-only protection. Explicit approved paths can grant configuration writes.
- Linux refuses overlapping read denials because bubblewrap implements denied paths by masking. Its default project policy uses no such denial.
- Bubblewrap supplies a private `/tmp` before mounting granted paths. An ungranted write there can succeed inside the sandbox without changing the host. Native boundary tests check host sentinels and the absence of newly created outside files, including writes by detached descendants. Reads must still refuse and granted project writes must reach the host.
- Compilation of write-only rule exclusions remains unfinished and those invocations refuse.
- The rule tester, dedicated rule editing routes, richer rule match presentation, and remaining native adversarial tests are unfinished. [The roadmap](../roadmap.md) tracks them.
- Native enforcement depends on platform support and successful launch. Unsupported hosts and setup failures refuse without fallback. The user can deliberately choose unrestricted mode in the selected profile.
- The sandbox covers workers and descendants. The server, Pi, in-process add-ons, supplied secrets, preexisting aliases, and development servers that reload writable harness code remain outside this guarantee.
