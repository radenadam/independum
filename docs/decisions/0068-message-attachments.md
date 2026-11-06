# Message attachments

- Status: accepted
- Date: 2026-11-06

## Context

The maintainer approves original file retention, explicit delivery forms, strict limits, and exact read grants. Queue and steer ship in decision 0064. Profiles own agent settings in decision 0061, and decision 0063 supplies the approval store. Decision 0067 then permits reads everywhere except denied paths and keeps Independum's state folder denied even with an exact approval. Pi accepts images and prepares them, but has no retained upload store or general binary document message type.

## Decision

- The message box accepts files through a picker, paste, and drop, including attachment-only prompts. Paste preserves distinct plain text without duplicate image HTML. Folders fail visibly, and dropped URLs are never fetched.
- Filled attachment tiles open original metadata and prepared input in a dialog. Each tile states Image, Text included, or File path included before sending. Upload and preparation errors preserve the draft and block Send.
- Original bytes live under generated UUIDs in a sibling of the state folder, normally `~/.independum-attachments`. A custom state folder uses its basename with `-attachments` appended beside it. This keeps uploads outside the denied state folder because an exact grant cannot override its denial, including Linux's private mask. No part of the state folder is opened. Names never select storage paths. Unreferenced uploads expire after seven days. Cleanup checks every saved branch, archived chat, and pending input before removal, and retains files when references cannot be read safely.
- Uploading saves no read approval because decision 0067 already permits these reads. Saved ask and deny rules still apply when a tool reads the original. Uploading grants no write or network access and never overrides a denied path.
- Text uses strict UTF-8 or marked UTF-16 decoding and preserves line endings. Invalid decoding remains a File. Large text requires the user's explicit Include file path choice. Binary documents include a saved path without extraction.
- Supported images use Pi's exported detection and preparation functions. Idle prompts and steers receive the same prepared blocks. Failure blocks handoff. Original bytes remain available, and canonical Pi messages retain images for later model choices.
- A model without image input has the visible notice This model receives the image details, but not its pixels. No model substitution, OCR, or invented description occurs.
- Attachment settings belong to the selected profile under `settings.attachments`. Missing fields use built-in values. The approved limits, details switch, and resizing switch are editable in Session and the profile editor. Context controls can also disable resizing.
- Attachment facts use editable model texts in Attachments. Names and paths are JSON strings in their slots. The shared envelope moves from Shell to Notes, as decision 0040 requires. Turning details off leaves explicit text and image blocks, and a File alone then fails validation.
- Pending inputs save attachment references and explicit file path choices. They validate on acceptance and prepare again at handoff with the applied profile and captured model. Prepared text and images reach the `input` hook with their message, for immediate prompts, queues, and steers. Pi metadata binds source references and offsets to canonical user content without another prepared transcript.
- Known image count limits apply to the effective request before forwarding to Pi's stream function. Absent limits stay unknown. Nothing is trimmed, dropped, or summarized to fit.
- Copy includes attachment names and inline text. Markdown export includes delivery forms and inline text without storage paths or base64 images. Original previews use authenticated requests and browser object URLs.

## Consequences

- This extends decisions 0013, 0016, 0033, 0061, 0063, 0064, 0065, and 0067, and completes the envelope move of decision 0040.
- Pi keeps its messages and agent loop. Independum supplies retained sources, validation, durable references, and UI. No extraction or image conversion dependency is added.
- Original paths remain readable after restart under the same system read boundary. Retained references and cleanup do not depend on saved approvals. The upload store does not create an exception inside any denied folder.
- Editing and resending prompts, retrying replies, forks, and branch switchers remain checkpoint work in `docs/roadmap.md`, as the maintainer permits for this change.
- The storage, API, and current limits live in [the attachment product page](../product/attachments.md).
