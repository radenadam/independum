# Chats run on their own

- Status: accepted
- Date: 2026-11-04

## Context

Independum held one Pi session, for the open chat, and stopped a running reply when the user opened another chat, as decision 0014 set. The maintainer works with several agents at once, like tabs of a terminal that each run an agent CLI, and asked for every chat to run on its own, so leaving a chat never stops it.

## Decision

- Each chat runs on its own. Opening another chat or starting a new one never stops a reply or a background command, and the chat goes on where the user left it.
- The sidebar shows every chat that replies with its waving title, also when it is not open.
- A background command that ends wakes the agent of its chat, whether the chat is open or not.
- The open chat shows its reply as it streams. A chat that opens in the middle of a reply shows the reply so far first, then the rest as it comes.
- Stop stops the reply of the open chat only. Archiving or deleting a chat that runs stops it first.
- A chat that is not open and has no reply and no background command left lets its Pi session go, and opens again from its file.
- A notification tells the user when a reply ends where they do not see it: in a chat that is not open, or in the open chat while the window of Independum is not in front. A click on it opens the chat.

## Consequences

- Decision 0014 no longer holds where it stops a running reply, and decision 0050 covers chats that are not open.
- Every chat that runs holds its own Pi session, and its requests cost what they cost while the user looks elsewhere.
