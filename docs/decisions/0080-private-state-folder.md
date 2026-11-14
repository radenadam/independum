# Private state folder

- Status: accepted, amends [decision 0063](0063-permissions-and-enforced-tool-access.md) and [decision 0067](0067-read-everywhere-and-write-inside-the-project.md), changes the storage boundary of [decision 0065](0065-script-hooks-and-the-add-on-contract.md) and [decision 0068](0068-message-attachments.md)
- Date: 2026-11-14
- Source: direct maintainer answer in this task on 2026-11-14
- Kind: product requirement

## Context

The direct maintainer answer of 2026-11-14 replaces the denial of the entire state folder. That denial prevents the model from retrieving retained command output and prevents scripts beside user profiles from running. Independum is a harness of control. Secrets alone are denied because the rest of its folder is the user's to inspect. Linux can mask only folders safely, so secrets share one folder.

## Decision

- Only `private` beneath the state folder, normally `~/.independum/private`, is always denied in project mode. Neither rules nor approvals open it. It contains Pi's `auth.json` and `models.json`, the server connection and access token in `server.json`, the phone pairings in `phones.json`, and other former runtime contents. Unrestricted mode keeps account authority.
- Chats, cut output, attachments, profiles, and hook scripts are readable like ordinary files, subject to saved read rules. Every state write needs explicit approval by default even when an allow rule matches, using the same protected path mechanism as project configuration. Native commands receive read-only protection beneath overlapping write grants.
- Keep Pi's `sessions` folder. Keep per-chat output and hook evidence in `outputs`. Store attachment originals and manifests in `attachments/<id>`. Create no new home-level folder. These layout names are the implementation choice within the maintainer's delegated scope.
- Before startup consumers open state, preflight all old and new paths. Rename `runtime` to `private`, move the two Pi secret files into it, and rename the former sibling attachment store into `attachments`. Read no migrated content. If both source and destination exist, fail with an error naming both paths instead of overwriting. Repeated startup does nothing after migration. Preserve runtime privacy checks.
- Discovery reads a legacy server record in place and defers migration until that server removes its record or discovery receives `ECONNREFUSED`, preserving runtime paths for paired phones while any response or other connection failure leaves liveness unresolved.
- Project only Independum's saved attachment input from the exact former sibling source path to its new `attachments` path, leaving Pi files unchanged and showing the projected path in the ordinary request inspector.
- The editable permission fact and Session describe the private denial and protected state writes. Keep the Linux empty private mask disclosure and host-effect tests.

## Consequences

The server and phone records of [decision 0066](0066-headless-mode.md) and [decision 0070](0070-phone-access-with-device-pairing.md) move without changing their authority or privacy checks. The CP-14 hook and CP-17 cut-output reproductions become ordinary regressions. Temporary-home migration tests cover identity preservation, restart, collisions, and unsafe paths. Policy and tool tests cover private denial, readable state, and approval despite allow rules. Native runs remain coordinator evidence where unavailable. Earlier decisions retain their historical bodies with this amendment linked from their status.
