# Web app launched from the terminal

- Status: accepted
- Date: 2026-10-24

## Context

An installable desktop app needs code signing, or Windows Defender and macOS Gatekeeper warn users away from it. Signing costs money and setup time that the project does not have yet. A browser UI runs on Windows, macOS, and Linux today.

## Decision

Independum runs as a local Node.js server, started by the `independum` command. The UI runs in the browser. A desktop app waits until the project is mature.

## Consequences

- Users need only Node.js and a browser.
- The server and the UI stay independent of any desktop shell, so one can wrap them later.
