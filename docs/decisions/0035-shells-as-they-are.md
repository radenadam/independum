# Shells as they are

- Status: accepted, and amended by [decision 0036](0036-options-for-commands.md), which lets the user add environment variables, by [decision 0041](0041-windows-jobs.md), which ends on Stop the programs that a command leaves behind on Windows, and by [decision 0048](0048-session-place.md), which shows the shells in the Session place, with sandbox shell and environment boundaries amended by [decision 0063](0063-permissions-and-enforced-tool-access.md) and [decision 0067](0067-read-everywhere-and-write-inside-the-project.md)
- Date: 2026-10-29

## Context

Research into the shell tools of other harnesses found traps in Windows PowerShell 5.1, and tests on Windows confirmed three of them. Some came from Windows PowerShell itself, such as `>` writing UTF-16 and no `&&` between commands. Others came from the script that Independum wrapped around each command: errors named a temporary file with line numbers two too high, and an exit code that Independum rewrote turned a success into a failure. Independum also set `PAGER`, `GIT_PAGER`, and `GIT_TERMINAL_PROMPT` for every command. The maintainer decided that making up for what a model does not know about its shell is out of scope. Independum tells the model where it works and offers the user options, and the model decides what to run.

## Decision

- [Decision 0063](0063-permissions-and-enforced-tool-access.md) makes sandboxed Windows commands use installed PowerShell 7 or Windows PowerShell 5.1. Unrestricted mode offers PowerShell 7 or Git Bash. On macOS and Linux, Shell runs Bash, or PowerShell 7 when it is installed. When the chosen shell is missing, the Agent place says what to install, and the installer will explain it later.
- The name of a shell carries the version that the shell reports, such as PowerShell 7.6.9, so the model knows which features it has.
- A command runs as written. PowerShell gets it after `-NoLogo -NoProfile -NonInteractive -Command`, and Bash after `-c`. The model reads the exit code that the shell process returns.
- Independum sets one thing on the way from PowerShell to itself. PowerShell writes to a pipe in the code page of the console, which loses most characters before Independum can read them, so the first line of each command sets UTF-8 for its output. The command keeps its own line numbers.
- Commands use the minimal environment by default under [decision 0063](0063-permissions-and-enforced-tool-access.md). Inheriting everything is an explicit profile choice. The access token is removed after profile overrides.
- The output of a command arrives until it has been quiet since the shell ended, for up to two seconds. When a program that the command started still holds the output, the result says so. A command that a signal ends says which signal.

## Consequences

- `AGENTS.md` gains the rule that Independum never changes how a program behaves to make up for what a model does not know.
- PowerShell reports the exit code of its own last command, so a program inside it that exits with 3 reads as exit code 1. That is how PowerShell works.
- Windows lets Node see a PowerShell 7 from the Microsoft Store only as an alias. Unrestricted mode accepts it, and sandboxed mode excludes it because ProcessContainer cannot launch it.
- Programs that a command leaves behind on Windows can still outlive Stop. Ending them is open work in the roadmap.
- This amends decision 0029, whose example named Windows PowerShell 5.1.
