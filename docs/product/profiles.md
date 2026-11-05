# Profiles

Decision: [0061](../decisions/0061-profiles-and-plain-settings.md). A profile is one complete agent setup without inheritance. User and project defaults affect new chats. Each chat keeps its resolved profile, and edits to that profile affect its later work.

## Files

| Path | Contents |
| --- | --- |
| `~/.independum/settings.json` | `formatVersion: 1`, required `defaultProfile` with user scope, and optional `knowledgeCutoffs`. |
| `<project>/.independum/settings.json` | `formatVersion: 1` and optional `profile`. Absence uses the user default. |
| `~/.independum/profiles/<id>/profile.json` | `formatVersion: 1`, nonempty `name`, and optional `settings`. |
| `<project>/.independum/profiles/<id>/profile.json` | The same profile format with project scope. |
| `<profile>/SYSTEM.md` | Optional exact base prompt. An empty file supplies no base prompt. |
| `<profile>/model-texts.json` | `formatVersion: 1`, optional `systemPromptBuiltIn`, and optional `texts` mapped by existing text ids to `text` and optional `builtIn`. |
| `~/.independum/chat-settings/<id>.json` | `formatVersion: 1`, required `profile`, and optional `overrides` for `model` and `thinkingLevel`. |

A reference contains `scope`, either `user` or `project`, and `id`. Equal ids in different scopes are distinct. Ids use lowercase kebab-case, start with a letter, contain at most 64 ASCII characters, and cannot name Windows devices. The project is the exact chat folder from Pi. No ancestor search or Git root substitution occurs.

Profile settings permit `model`, `thinkingLevel`, `shell`, `disabledTools`, `disabledFacts`, `outputLimits`, `handBackSeconds`, `environment`, `modelOverrides`, and `compaction`. The model is null or an object with `providerId` and `modelId`. Effort is null or a Pi thinking level. Null requests automatic effort. Missing settings use their built-in values. [Tools](tools.md#shared-contract) and [model settings](settings.md#model-settings-and-compaction) define the ranges. Knowledge cutoffs and logins never enter profile settings.

Chat overrides use the same model and effort shapes. An absent override follows the profile. An explicit model null leaves the chat without a selected model. Empty chats save their choices with the first accepted prompt.

JSON accepts a leading byte order mark but rejects comments, duplicate keys, unknown fields, trailing commas, and unsupported versions. Diagnostics identify a file and JSON pointer. `SYSTEM.md` preserves line endings and its final newline, and its body is never interpreted as a file path. No arbitrary resource or code inside a profile is loaded.

## Editors and application

Profiles in Settings lists user profiles and profiles of the current project, chooses the user default, and creates or duplicates a profile. The selected profile row in Session opens a switch review and the same profile editor. Project settings in the chat detail chooses the project's default for new chats.

The profile editor reuses the existing tool, model text, fact, model override, and compaction editors. It shows the folder, scope, and number of chats affected. The file bundle editor keeps a dirty draft across external edits and offers reload and a comparison before saving against the newer revision. A model text dialog captures its starting save revision and keeps its draft after a failed conditional save.

The server watches parent folders and rereads configuration before mutations and new work. Formatting changes update disk revisions without changing the effective revision. Running replies keep their setup until Pi settles after continuation. A changed profile then builds fresh tools, hooks, and in-memory Pi settings around the same session manager. A background command retains its launch settings and completion texts.

Invalid configuration blocks dependent new work and shows a precise issue. An existing run keeps its last applied setup visible. A broken project default does not affect chats with an already saved reference. Unrelated profiles keep working.

## API

All paths have the `/api` prefix and the access checks of [server startup](server.md#startup-and-access).

| Method and path | Behavior |
| --- | --- |
| `GET /settings` and `PUT /settings` | Read or replace user defaults and model cutoffs. |
| `GET /projects/:projectId/settings` and `PUT /projects/:projectId/settings` | Read or replace one known project's default. |
| `GET /profiles?projectId=...` | List user and project profiles, their issues, defaults, and known project ids. |
| `GET /profiles/:scope/:profileId?projectId=...` and `PUT /profiles/:scope/:profileId?projectId=...` | Read or replace a bundle with `profile`, nullable `systemPrompt`, and nullable `modelTexts`. |
| `GET /profiles/:scope/:profileId/agent?projectId=...` | Read the existing agent editor contract in a profile context. |
| `PUT /profiles/:scope/:profileId/settings?projectId=...` | Apply named editor changes to that explicit profile. |
| `GET /chats/:id/settings` and `PUT /chats/:id/settings` | Read or replace chat choices, and inspect desired and applied configuration. |

Reads return the document, path, disk revision, and issues. Profile resources include scope and chats using them. Chat configuration includes applied and pending revisions and effective values with source paths and JSON pointers. Replacement requires `If-Match`. Creation requires `If-None-Match: *`. Missing preconditions return 428, stale revisions return 412, malformed JSON returns 400, schema errors return 422, and missing dependencies or recovery conflicts return 409. Successful saves return the durable resource. No arbitrary filesystem path enters these routes.

## Migration and recovery

Fresh installs create a real default profile and user settings. A valid unversioned settings file migrates its runtime values and text baselines into a profile, preserves its original bytes in `migrations/settings-before-profiles.json`, and binds saved and archived chats while preserving their model and effort. A collision chooses the first available migrated-settings id. The user settings file changes last. Once versioned, no legacy runtime fields are read.

Configuration writes use Pi's mutation queue, a cooperative lock, staged files, a journal, and temporary recovery copies. A prepared journal completes only when every target matches its recorded old or new state. Another editor's third version stops recovery and preserves both versions. An abandoned lock requires review after its server stops. Ordinary editors do not honor the lock, so the final filesystem replacement cannot provide compare-and-swap against them.

## Remaining checkpoint work

The exact remaining work is in [the roadmap](../roadmap.md). Browser preference files and deletion are not implemented in this foundation. Field-level source presentation, automatic cleanup of redundant external text edits, and richer model text conflict review also remain.

## Code

- [Profile resolution and migration](../../packages/independum/src/create-profile-store.ts), [strict schemas](../../packages/independum/src/configuration-schema.ts), [file transactions](../../packages/independum/src/configuration-files.ts), and [routes](../../packages/independum/src/profile-routes.ts).
- [Settings management](../../packages/web/src/profiles-section.tsx), [shared profile editor](../../packages/web/src/profile-editor.tsx), [chat profile detail](../../packages/web/src/profile-detail.tsx), and [file drafts](../../packages/web/src/profile-files.tsx).
