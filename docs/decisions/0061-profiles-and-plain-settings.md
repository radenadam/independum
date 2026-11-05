# Profiles and plain settings

- Status: accepted, with the remaining work listed in `docs/roadmap.md`
- Date: 2026-11-05

## Context

Tool settings and model texts belong to the user in decisions 0031 and 0033. They reach every chat, and files load only at startup. The maintainer defines a profile as a complete setup for one use case and approves plain files that the UI and a text editor both change.

## Decision

- A profile is a folder under the profiles folder of the user or the exact project folder. Its directory name is its stable id. Profiles have no inheritance. Duplicate a profile to make a variation.
- `profile.json` holds its name and runtime settings. An optional `SYSTEM.md` holds its base prompt exactly, including an empty body. An optional `model-texts.json` holds other text edits and recorded built-in wording. A hand-written edit may omit its baseline, which the editor identifies as unknown.
- Omitted profile settings use built-in values. Tools, environment, added fact switches, model text edits, model defaults, model overrides, and compaction settings belong to the profile. Knowledge cutoffs remain user facts about a provider and model. Logins remain owned by Pi and the user.
- User settings choose a user profile as the default. Project settings may choose a user or project profile. New chats resolve an explicit choice, then the project default, then the user default. A chat keeps that reference independently of later default changes.
- Chat settings save the profile and explicit model and effort choices separately from Pi sessions. Empty chats keep them in memory until the first accepted prompt. A profile switch clears those overrides and shows its resulting model and effort before applying.
- Settings manages profiles. Session shows the selected profile and opens its detail. The chat detail opens project settings for new chats. Profile details reuse the tool, fact, model, compaction, and text editors, and identify the profile, scope, folder, and chats affected.
- Files are authoritative. JSON accepts a leading byte order mark and rejects duplicate keys, comments, trailing commas, unknown fields, and unsupported versions. Errors name the file and JSON pointer. Files use UTF-8, and writes use two spaces and a final newline.
- A conditional save compares the resource revision after acquiring a cooperative lock. A staged transaction records old and new revisions and keeps recovery copies through replacement. Recovery stops if an external editor supplies a third version. Managed writes reject path traversal and links or junctions within managed configuration folders.
- Directory watches debounce for 200 milliseconds and compare two reads before notifying chats. Every new unit of work and every UI mutation reads its dependencies again. The exact disk revision is separate from the revision of resolved values, so formatting alone does not rebuild a runtime.
- Invalid files remain visible and block dependent new work. Already running work finishes with its captured setup. The last applied setup stays inspectable, and unrelated profiles remain usable.
- Runtime edits wait for Pi's `agent_settled` boundary, which includes queued continuation. A new session runtime uses the same Pi session manager and a fresh in-memory settings manager. Tools and request hooks capture that applied configuration. Background commands keep their launch environment, limits, and completion texts.
- Profile application records its reference and revision as a custom Pi entry. No profile name, configuration path, or application announcement reaches model context. Pi continues to own sessions, model capability adjustment, compaction, and logins.
- Valid unversioned settings migrate into a real user profile with the original bytes preserved in `migrations/settings-before-profiles.json`. Saved and archived chats preserve their active branch model and effort. A profile id collision uses the first available migrated-settings id. The versioned user settings file is replaced last. Invalid legacy content requires repair.
- The foundation ships first. Browser preference files, profile deletion, complete source details, and the remaining conflict interactions follow in this checkpoint as the roadmap states. Browser preferences retain their existing behavior until that work ships.

## Consequences

- This decision amends the ownership, storage, and invalid-file fallback of decision 0031 and the storage and application timing of decision 0033.
- It extends decision 0048 with the profile row and project settings. It moves the overrides and compaction of decision 0055 into profiles. The cutoffs of decision 0054 remain user facts, and its switches and texts move into profiles.
- Decision 0058 keeps chat addresses by id. New chats now follow their resolved profile defaults instead of copying the source chat's model. The old runtime body of `PUT /api/settings` is removed.
- Pi has no profile store, strict configuration diagnostics, file revision contract, or migration transaction for these harness resources. Independum supplies those pieces and uses Pi's public runtime and session APIs.
- A crashed writer can leave a cooperative lock that needs review after its server stops. Recovery copies stay available when recovery cannot safely complete.
