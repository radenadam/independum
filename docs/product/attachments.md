# Attachments

Decision: [0068](../decisions/0068-message-attachments.md). Attachments retain original bytes and show how each contributes model input.

## Composition and delivery

Add attachment opens a multiple file picker. Paste and drop use the same bounded upload route. Paste with files prevents duplicate clipboard HTML and preserves accompanying plain text at the cursor. Paste without files stays native. Drop rejects folders and never fetches URLs.

Each attachment uses `PlaceRow` with its name and Image, Text included, or File path included. Images have original thumbnails. Remove sits beside the tile. A phone-sized `ModalDialog` shows the original name, media type, exact byte count, supported original preview, prepared model text and image, and errors. Saved model text requires an exact match after hooks, otherwise the dialog says it cannot be located. A text attachment can explicitly choose Include file path. Sending is blocked while upload or preparation is incomplete or invalid. Failure preserves the draft and its other sources.

Attachment-only input is allowed when prepared text or images contribute input to the selected model. Images remain canonical Pi blocks when the model lacks image input. The composer states This model receives the image details, but not its pixels. Pi supplies the provider omission behavior. There is no OCR, description, or model substitution. A File contributes no input when details are off, so it cannot be sent alone.

Waiting messages retain sources, names, counts, and file path choices. Their detail shows original metadata and says preparation happens at handoff. Delivery prepares again with the applied profile and captured model. Prepared text and images pass through the `input` hook with their message. Stop and restart preserve those references as [waiting messages](message-box.md#waiting-messages). Missing sources require Attach this file again.

## Settings and model input

The selected profile owns `settings.attachments`. Its exact fields and approved built-in limits live in [read-attachment-settings.ts](../../packages/independum/src/read-attachment-settings.ts). Counts and byte limits are positive safe integers. Aggregate limits must be at least their per-file limits. Missing fields use built-in values, unknown fields fail, and booleans accept only booleans. Session opens Attachments for number fields, reset, the details and resizing switches, and model texts. The profile editor reuses these controls. [Context controls](context.md) can independently disable resizing.

Inline decoding accepts strict UTF-8, including its byte order mark, and UTF-16 with a byte order mark. It rejects replacement decoding and malformed UTF-16. Content and line endings stay intact. Undecodable bytes, binary signatures, and unsupported images remain Files. PDF and Office documents are saved without extraction. Pi detects supported PNG, JPEG, GIF, and WebP images from bytes.

`attachment.source`, `attachment.details`, and `attachment.text` are editable in Attachments. Their slots and wording live in [attachment-texts.ts](../../packages/independum/src/attachment-texts.ts). Names and paths fill slots as JSON strings. With details enabled, `wrapNote` wraps details and inline text in the shared Notes envelope. With details off, explicit text stays literal and images remain blocks. Pi's dimension note follows when resizing changes dimensions.

Preparation uses Pi's exported `resizeImage` and `formatDimensionNote`, the selected model limits, and Pi defaults when limits are absent. Failure blocks acceptance or holds waiting delivery. The preview shows prepared changes and warns that resizing may change animation. Image counts use the effective request, including retained history and tool images, before forwarding to Pi. Absent limits stay unknown. Source limits do not guarantee context capacity, and context or provider failures remain reply errors.

## Storage and grants

Each source has `~/.independum/attachments/<attachmentId>/content` and `manifest.json`. The id is a generated UUID. The version 1 manifest holds `id`, `uploadedForChatId`, `name`, `mimeType`, `bytes`, `kind`, `encoding`, and `createdAt`. Names are basenames with no control characters and at most 255 Unicode code points. Kind is `text`, `image`, or `file`. Encoding is `utf-8`, `utf-16le`, `utf-16be`, or null for images and Files. Bytes count the original source, and creation time is Unix milliseconds. Media type is advisory until image detection validates it. Managed paths refuse links, and sources refuse linked or changed-length content.

The store is inside the state folder at `attachments`. Startup renames the former sibling store here without reading its contents and refuses when both paths exist. [Decision 0080](../decisions/0080-private-state-folder.md) replaces the storage boundary of decision 0068. Uploading saves no read approval because state outside `private` is readable. Model writes to state require explicit approval by default even under allow rules. Saved ask and deny rules still apply to tool reads. Uploading grants no write or network access.

Discovery preserves phones' legacy runtime paths until record removal or connection refusal. Saved Independum input maps exact quoted legacy paths for its attachment ids throughout the user message, leaving Pi files unchanged. The request inspector shows mapped paths.

Pending inputs retain `attachmentIds`, `fileAttachmentIds`, and original summaries. File choices name unique attached ids. The `independum-input` Pi entry adds pre-hook offsets, text prefixes, SHA-256 digests, and image indexes. Prepared content stays in Pi's user message. Metadata never enters model context.

Legacy offsets require re-preparing input and matching complete saved text and attachment boundaries, allowing path migration. Editable wrappers prove nothing. Unverified input keeps the unavailable notice. Direct maintainer product corrections: 2026-11-14, 2026-11-15.

Sources remain while any saved branch, archived chat, or waiting input refers to them. Cleanup runs at startup and hourly, and removes unreferenced sources at least seven days old after scanning all retained references. Unreadable reference files prevent cleanup. Deleting a chat does not immediately remove shared sources. Cleanup requires no saved approval changes.

The versioned [browser draft](chats.md#drafts-and-export) keeps source references, display metadata, and file path choices with text under one key. It stores no content or prepared image data. Acceptance clears only submitted attachment keys, preserving newer uploads and other chats. Failure preserves sources for an idempotent retry.

## API

All paths below start with `/api/chats/:id` and retain token, host, and origin checks.

| Method and path | Contract |
| --- | --- |
| `POST /attachments?name=...` | Raw bounded body and advisory `Content-Type`. Returns a source summary with 201 after saving the original. Declared and streamed byte limits apply. |
| `GET /attachments/:attachmentId` | Current prepared preview. `form=file` chooses a saved path. Otherwise text and supported images are inline. |
| `GET /attachments/:attachmentId/content` | Original bytes for the chat or a retained reference. Images use their validated type. Other files use `application/octet-stream`, attachment disposition, `nosniff`, and no-store caching. |
| `POST /messages` | Send and edit accept optional `attachmentIds` and `fileAttachmentIds`. An edit defaults to its saved sources and file path choices. A retry accepts no replacements and uses its saved prompt sources. Text may be empty when attachments contribute input. |

Invalid names, ids, or shapes return 400, missing sources or another chat's unreferenced uploads return 404, limits return 413, preparation failures return 422, and persistence failures return 500. Errors include a stable code and a complete-sentence message. [Decision 0064](../decisions/0064-queue-and-steer.md) still governs durable acceptance and idempotency.

## Code and verification

- [Source store](../../packages/independum/src/create-attachments.ts), [handoff and projection](../../packages/independum/src/create-chat.ts), and [routes](../../packages/independum/src/create-chat-routes.ts).
- [Draft lifecycle](../../packages/web/src/use-attachment-draft.ts), [tiles and details](../../packages/web/src/attachment-list.tsx), and [profile controls](../../packages/web/src/attachment-settings-detail.tsx).
- `pnpm qa attachments` covers picker, paste, drop, each form, image limitations, details, queue, steer, stop, resume, and both phone themes. `pnpm qa queue` checks existing delivery boundaries.

Edit and resend restore retained sources and file choices. Retry keeps its prompt's sources. Both prepare at handoff without duplicating legacy images. [Forks remain planned](../roadmap.md). CP-21 keeps browser and native verification open. [Browser QA](../browser-qa.md) owns execution.
