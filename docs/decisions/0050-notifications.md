# Notifications

- Status: accepted, and amended by [decision 0051](0051-chats-run-on-their-own.md), which notifies about chats that are not open too
- Date: 2026-11-04

## Context

A reply can take minutes, and the user leaves the window of Independum while it runs. The maintainer asked for a notification when the model is done, and later when the model asks the user something.

## Decision

- Independum shows a notification through the system when a reply of the open chat ends while its window is not in front, because the tab is hidden or another window has the focus. A reply that the user stops ends while the window is in front, so it shows none.
- The notification holds the title of the chat and the first line of the reply, or that the reply failed and why. A newer one of the same chat takes the place of an older one, and a click on it brings Independum to the front.
- The user turns notifications on in a Notifications section of the settings, for this browser. They are off at first, because the browser asks the user for leave to show them, and it asks only after the user acts. Turning them on asks the browser, and they stay off when the browser says no, with a note that says so.
- The same path will tell the user when the model asks something, once the model can.

## Consequences

- The glossary gains Notification.
- A phone browser that shows notifications only from a service worker shows none, until Independum has one.
