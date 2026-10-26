# Managing chats

- Status: accepted
- Date: 2026-10-26

## Context

The sidebar listed every chat by project, with no way to rename, pin, archive, or delete one, and no quick way back to the newest chats.

## Decision

- The sidebar lists the pinned chats first, when there are any, then the five newest chats that are not pinned under Recent, then the projects.
- Each chat in the sidebar has a button with three dots, which shows while its row is hovered and always on a touch screen. A right click on the row opens the same menu. The menu holds Rename, Pin or Unpin, Archive, and Delete, and opens as a sheet on a phone like the other menus.
- Rename edits the title in place, and Pi saves the name with the chat.
- Independum keeps the ids of pinned chats in `~/.independum/pinned-chats.json`.
- Archive moves the chat file into `~/.independum/sessions/archived`, which Pi does not list. The Archived chats section of the settings lists them, with a way to bring each one back or delete it.
- Delete asks first, then removes the chat file for good.
- Archiving or deleting the open chat opens an empty chat in its folder.

## Consequences

- An archived chat stays a readable file, so nothing is lost until the user deletes it.
- A chat keeps its place when it is renamed, pinned, or archived and brought back, because Pi dates a chat by its last message.
