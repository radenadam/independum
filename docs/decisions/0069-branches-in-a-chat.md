# Branches in a chat

- Status: accepted, with forks remaining in `docs/roadmap.md`
- Date: 2026-11-06

## Context

The maintainer approves editing and resending prompts, retrying replies, and a filled tile switcher. Pi owns the session tree, but its tree navigation returns only editor text. Its queue has no durable input identities. Decision 0064 already supplies removable inputs, receipts, and held delivery.

## Decision

- Editing loads the submitted text and retained attachments into the message box without moving the shared branch. Attachments can be removed or added while editing. Cancel restores the ordinary device draft and its attachments. Sending creates a prompt variant and keeps the original path.
- Retry submits the same saved prompt with the original reply's model and recorded effort, or with choices made in a local dialog. An unavailable model or unknown effort needs a visible choice. Unsupported effort fails before Pi can clamp it.
- Retry uses current agent settings. Submitted text remains literal, so editing or retrying a command expansion never expands it a second time.
- Each edit or retry uses the durable pending input and receipt contract. It captures the source user entry and, for retry, the first assistant entry. A retry accepts no replacement text. Retained attachment sources and explicit file path choices remain available to both paths and prepare again at handoff. Legacy inline image blocks remain available without duplicating retained images.
- Prompt variants and reply attempts keep creation order. The filled `PlaceRow` tile says which alternative is selected and opens choices in `MenuList`. A choice restores its most recently visited descendant path.
- The first user entry identifies a prompt group. An edit has a new variant identity. A retry shares its source variant and has a new attempt identity. Legacy entries use their Pi entry ids. Equal text and timestamps never establish identity.
- Branch selection appends `independum-branch-selection` on the selected path, so Pi reopens that path after restart. Selection, input, and variant metadata never enter model context. Metadata creates no additional alternatives.
- Branch mutations require an idle chat without background commands or waiting inputs. They compare the expected pending revision and leaf immediately before mutation. A boundary with an unmatched tool call or result refuses.
- The input leaf identifies the latest message, context edit, compaction, summary, or saved branch selection. Model choices and other metadata do not move this boundary, so choosing a model while editing keeps the edit valid. Selecting a branch still invalidates an earlier draft.
- Switching branches changes saved messages. Files keep their current state. The Session place refreshes its selected context and request history. Saved messages do not replay their entrance motion when a branch is selected.
- Pi reconstructs the selected branch's request history, but the harness retains only one raw provider request per chat. Branch navigation clears that capture and shows the next request preview until another request is sent, so a payload from another path is never presented as the selected request.
- Browser drafts use a versioned object with text, attachment references with display metadata and file path choices, and an optional edit source. An ordinary draft stays separate inside an edit draft. Existing text drafts load without losing their text.

## Consequences

- This extends decisions 0013, 0016, 0058, and 0064. The reply parts and groups of decisions 0027 and 0047 keep their existing behavior.
- Independum derives alternatives through Pi's public session APIs and recreates an idle session after literal leaf selection. It adds no agent loop, branch summary, or summarization call.
- This change ships edit, resend, retry, and the switcher with the retained attachment sources of decision 0068. Forks remain in the roadmap. Legacy inline images remain available.
