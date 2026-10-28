# Tool settings

- Status: accepted
- Date: 2026-10-28

## Context

The Shell tool needed a choice of shell and a limit on the output that reaches the model, as decision 0029 describes. The maintainer wants every tool visible and editable, with a way to turn each one off, and left the shape of that to the agent. The roadmap also asked where settings other than logins live.

## Decision

- The settings of tools belong to the user, so they hold in every chat and every project. They live in `~/.independum/settings.json`, which Independum reads when it starts and writes on each change. A setting that a hand edit breaks falls back to its default.
- The Agent place shows each tool in a card: its name, a switch that turns it on or off, the description that the model reads, its own settings, and its parameters. A tool that cannot run on this computer says why.
- Shell offers PowerShell and Bash, and a shell that is not installed cannot be chosen. A new shell reaches the model with its next turn, because the description names the shell.
- The output limit takes lines and kilobytes, and saves itself a moment after a valid change. It applies from the next call of a tool.
- A tool that is off is hidden from the model, and a call to it does not run.

## Consequences

- `PUT /api/settings` changes settings and answers with the agent as it now is, and `GET /api/chat/agent` describes the tools, the shells, and the limits.
- The appearance settings and the choice of shell share `ChoiceGroup`.
- Whether some settings also belong to a project stays open in the roadmap.
