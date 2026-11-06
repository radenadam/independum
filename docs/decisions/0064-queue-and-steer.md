# Queue and steer

- Status: accepted
- Date: 2026-11-06

## Context

The maintainer approves queueing after a reply by default, an explicit steering alternative, and durable pending inputs. Pi supplies steering and settlement boundaries, but no public removal of one queued input. Profiles and context previews now define how new work captures its setup and command text.

## Decision

- Send stays available beside Stop during a reply. Enter uses the saved delivery mode. Ctrl+Enter uses the other mode, and a Mac uses Cmd. Phone Enter and Shift+Enter insert a newline. Composition never sends.
- User settings save `messages.whileReplying` as `queue` or `steer`. Its built-in value is `queue`. This is a composition preference, so it does not belong to an agent profile.
- Independum saves each input, its identity, captured model and effort, approval delivery mode, and command preview before returning acceptance. Pending inputs stay outside Pi and model context until handoff. A submitted draft clears only after acceptance and only when no newer draft replaces it.
- The message box lists pending inputs as waiting messages in one boxed list, and each row says what happens to it next. Their details show exact text, delivery boundary, model, effort, and any held reason. Removal succeeds before handoff or reports a conflict.
- An awaited Pi `turn_end` handler hands off one steer after the current turn and its tool batch. Steering has priority over follow-ups. One follow-up starts after `agent_settled` and finishes before the next begins. Automatic retry and compaction do not count as settlement.
- Stop holds pending delivery before aborting the reply. Failure, archive, shutdown, and restart hold remaining inputs. Resume explicitly starts delivery again. A later send does not unpause held work. Unarchiving also leaves it held.
- Each chat retains its own pending work while another chat is open. Deleting a chat deletes its pending file and receipts. Accepted inputs in an otherwise empty chat retain enough identity and folder metadata to reopen before Pi creates its session file.
- Input receipts make repeated requests idempotent. Changed content with the same id and stale pending or branch state fail. Atomic replacement saves short state mutations, and a failed write acknowledges no acceptance.
- Before handoff, a custom Pi entry records the input id and captured choices. Recovery matches that marker to the saved user entry. An uncertain handoff stays held instead of replaying automatically. Metadata and pending text never enter model context.
- Command and skill invocations use decision 0062 previews. Acceptance captures the shown text and provenance. A later source edit or preview expiry does not change accepted work. Pi's resource expansion remains disabled.
- A delivered steer is an ordinary user message with the visible fact Sent during a reply. It starts the next displayed reply at its actual transcript position.

## Consequences

- This amends decisions 0013, 0016, 0051, 0058, and 0061. The pending API and storage contract live in the product pages.
- Independum owns durable removable inputs because Pi only clears whole queues. It continues to use Pi's agent loop and does not clear or rebuild its queues to remove one message.
- [Decision 0068](0068-message-attachments.md) adds attachments to pending inputs and handoff. Conversation branches remain subsequent work in `docs/roadmap.md`, governed by the approved design.
