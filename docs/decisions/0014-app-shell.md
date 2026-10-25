# App shell

- Status: accepted
- Date: 2026-10-26

## Context

The maintainer wants the whole shape of Independum before any part of it gets deep, so the app is built breadth first. Independum is heading toward a desktop agent app with more places than chats, such as a reader, a file browser, and a browser. The shell has to give each of them a home without a redesign. The roadmap asked what the chat screen looks like, where settings open from, and how the agent's folder is chosen.

## Decision

- The margin holds the commands and the places. Today it holds New chat, Logins, and Chats, with the chat list under Chats. On a computer it stays in view while the page scrolls.
- The chat list shows the saved chats of the current folder, newest first, numbered, with the open chat marked. The Chats command opens the full list, with how long ago each chat changed. On a phone, the margin keeps only its commands, and the Chats command is the way to the list.
- The middle of the screen shows what the user works on. Today that is always a chat, with the model and the Change model command above its messages.
- A side panel beside the chat shows its details: the model, the system prompt, Pi's additions, the exact request, and later the tools. A command opens it, and on a phone it covers the chat until the user goes back.
- Chats belong to the folder that Independum starts from. Projects that switch between folders inside the app can come later.
- Opening another chat or starting a new one stops a running reply first, and Pi saves what the reply said so far.

## Consequences

- A new place, such as a reader or a file browser, gets a command in the margin and a view in the middle. Which places come next is an open question in the roadmap.
- The details panel arrives in its own change, and it shows the built-ins read-only until editing them is designed.
- Pi reads every saved chat of the folder to build the list, so a folder with a great many chats can make the list slow. Paging or search can come when that happens.
