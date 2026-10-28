# Working screen

- Status: accepted, and amended by [decision 0017](0017-logins-in-settings.md), which moves the first login into the settings too, and by [decision 0033](0033-model-texts.md), which makes the texts of the agent editable
- Date: 2026-10-26

## Context

Decision 0014 put the chat list in a margin and kept the Margin style of decision 0009 for the whole app. In daily use, the maintainer found that style too heavy with text for the screen where the work happens. Every action replaced the page, and the chat disappeared behind it. The maintainer explored a practical working screen on a clickable design canvas, chose each part of it, and kept the Margin style for the screens that greet the user. The canvas is at `https://claude.ai/artifact/7sZ9Zf8Mvym5YaJ9CrdCFe` and is private to the maintainer.

## Decision

- The working screen is laid out like a chat app. A sidebar on the left holds New chat, a search, the projects with their chats, and Settings. The chat fills the middle. A side panel on the right holds tabs.
- Every folder with chats is a project. Each chat works in its own folder, so opening a chat from another project moves the agent there. A new chat starts in the project of the open chat, or in a project chosen under the message box. Opening a folder that is not a project yet comes later.
- The message box holds a button for the model, which opens a pop-up with a search and the models grouped by provider, and the send and stop button. The chat's folder shows under the message box.
- A new tab in the side panel lists the places that can open there, and today the only place is Agent. Choosing a place turns the tab into it. The new tab has no search bar, because searching the web belongs to a browser place. Agent shows the model, the folder, the system prompt, what Pi adds, the tools, and the last request, all read-only.
- Logins and the appearance settings open in a settings dialog over the working screen. The Margin style stays for the welcome screen and the first login.
- The user's messages sit in bubbles on the right. Replies are plain text formatted from Markdown, with headings, lists, and code blocks.
- IBM Plex Sans sets the interface and the messages. IBM Plex Mono sets code, paths, and model ids. The colors stay those of decision 0009, and the working screen has no glow.
- The raven in the mark is orange. An item that is selected or open turns orange too, such as the open chat, an expanded project, the active tab, or a button whose menu is open.
- Actions are icons with tooltips that show their name and shortcut. Icons follow `docs/icons.md`.
- Provider logos come from the `@lobehub/icons-static-svg` package in their brand colors. A logo is found from the Pi provider id by general rules, never by a list of providers. A provider without a match shows no logo, and a list keeps the space for it so the names stay aligned.
- Shortcuts use a modifier key and work while the user types: Ctrl+Shift+O for a new chat, Ctrl+B for the sidebar, Ctrl+Period for the side panel, and Ctrl+Comma for settings. A Mac uses Cmd in place of Ctrl. Enter sends, and Escape stops a reply. Browsers keep Ctrl+N, Ctrl+T, and Ctrl+W for themselves.
- Motion stays calm and short. Messages rise in, pop-ups grow from their button, panels slide, projects unfold, the copy icon turns into a check, and New chat flashes orange. The thinking label and the replies type themselves in at a steady pace, which also smooths replies that arrive in bursts. Long titles fade at their end and slide into view on hover. None of this plays when the system asks for reduced motion.
- Sending a message scrolls it to the top of the chat and leaves room below for the reply.
- On a phone, the sidebar becomes a drawer, the model list becomes a sheet from the bottom, and the side panel covers the screen.

## Consequences

- Decision 0014 is superseded. The Margin direction of decision 0009 now covers only the welcome screen and the login screens.
- The working screen gets its own components. `CommandButton`, `ScreenLayout`, and `PickList` stay for the Margin screens.
- Formatting Markdown needs a dependency, and so do the provider logos.
- The sign-in flows move from the Margin login screen into the settings dialog for every login after the first.
- The welcome screen switches from its clipping wipe to real typing, so its text matches the typing in the chat.
