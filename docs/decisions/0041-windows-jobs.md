# Windows jobs for commands

- Status: accepted
- Date: 2026-10-29

## Context

On Windows, Stop ran `taskkill /T` on the shell of a command, which reaches a program only while every process between the shell and the program still runs. A program whose parent had ended ran on after Stop, such as one that a detached Node process starts. A Windows job holds a process and every process that it starts, so ending the job ends them all. Node cannot make a job, so the maintainer chose koffi, a library that calls the functions of Windows, over a helper in PowerShell and over leaving it as it was.

## Decision

- Each command on Windows runs in a job of its own. Stop first runs `taskkill /T` on the shell, and then ends the job. `taskkill` reaches every program whose parents still run, even one that left the job, and the job reaches every program in it whose parent has ended.
- Independum calls the functions of Windows through koffi, which loads only when the first command runs on Windows. When the job cannot be made, Stop uses `taskkill` alone, as before.
- The job closes when the run ends, so a program that a command leaves behind on purpose runs on, as before.
- On macOS and Linux nothing changes, because a command leads its own process group there.

## Consequences

- PowerShell from the Microsoft Store is a packaged app, and Windows starts every other program that it launches in a job of its own, outside the job of the command. Its parent is still the shell, so `taskkill` reaches it while the shell runs. A program whose parent has ended there still runs on after Stop, such as one that `cmd /c start` or a detached Node process starts.
- PowerShell from its installer or from its zip, and Git Bash, keep such a program in the job, so Stop ends it. In tests with the same version 7.6.9, a program that a detached Node process started ran on after Stop under the Store edition and ended under the zip. So the packaging work recommends PowerShell from its installer over the one from the Microsoft Store.
- koffi is a new dependency with its build script off, because its binary for each system comes as a package of its own.
