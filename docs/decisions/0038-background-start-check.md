# Background start check

- Status: accepted
- Date: 2026-10-29

## Context

A background command that failed at once still returned its id, and a note woke the agent a moment later, which cost an extra turn. The maintainer agreed to wait a moment before the call returns.

## Decision

- A call of Shell with `background` returns after two seconds. A command that still runs then goes on in the background, the same way as a hand-back in decision 0037, and the result holds what it printed so far, its id, and the file that receives its output.
- A command that ends sooner returns its whole result, like any other command of the reply, and no note follows.
- The wait is two seconds instead of the one second in the plan, because PowerShell 7 takes about 0.8 s to start and fail on Windows, against 0.1 s for Git Bash. With one second, a command that failed at once in PowerShell ended at 1.0 s, right at the limit.
- The `background` parameter says so in facts.

## Consequences

- Every background command starts in the reply, so the background commands no longer start one themselves, and they need no model texts.
- During those seconds, the step shows the buttons of a running command, and stopping the reply stops the command.
