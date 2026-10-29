# Options for commands

- Status: accepted
- Date: 2026-10-29

## Context

Decision 0035 stopped Independum from setting variables such as `PAGER` for every command, because the model decides what to run. Some programs still wait for a person, such as an editor that `git commit` opens without `-m`, or a sign-in window of Git Credential Manager, and a command gets no input. The maintainer wants Independum to offer the user options for this, and to tell the user, not the model, when a command may be waiting.

## Decision

- The Shell card in the Agent place has an environment of commands. Every command gets its variables on top of the environment of the user. It starts empty, and Independum sets nothing in it by itself.
- Suggestions under it add a variable with one click, each with what it changes, such as `GIT_EDITOR=true` or `GCM_INTERACTIVE=never`.
- The description of Shell names the variables that the user added, without their values, because a value can be secret. That sentence is a model text.
- When a running command has printed nothing for 30 seconds, its step and its row in the Commands place say so, and the step adds that it may be waiting for input. The model reads nothing about it.
- The reset of Shell empties the environment of commands too.

## Consequences

- The settings gain `environment`, and the progress of a command carries when it last printed, so the notice holds after a reload.
- The values sit in `~/.independum/settings.json` as plain text, and the Agent place shows them.
- Hand-back, which ends the wait of a reply on a command that runs for long, comes next and does not depend on this notice.
