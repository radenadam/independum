# Own tools

- Status: accepted
- Date: 2026-10-28

## Context

The first chat had no tools, as decision 0013 describes. The maintainer decided that Independum builds its own tools instead of using the built-in tools of Pi, one at a time, and that each tool is planned with care: what it does, its description, its parameters, and its life from call to result. The first one runs commands.

Independum takes a minimal approach, like Pi, so that it keeps up with models that change every month. A tool gives the model the information it needs to decide well, and leaves the decisions to the model.

## Decision

- Independum's tools are its own, registered with Pi as custom tools. The built-in tools of Pi stay off.
- A tool description holds only what the model needs to know about the tool and the harness to choose the tool and use it. It states facts and gives no rules of conduct. It leaves out what applies to every tool, such as output that is cut, because the harness says so in the result when it happens.
- The first tool is Shell. It runs a command in one shell: PowerShell on Windows, and Bash on macOS and Linux. Bash on Windows is Git Bash, never the Bash of WSL. A setting will choose the shell. The description names the shell, for example "Runs a command in Windows PowerShell 5.1 and returns its output and exit code. Each call starts a new process in the project folder, with no input."
- Shell takes a `command`, an optional `description` of a few words that heads its step, and an optional `timeout` in seconds. A command has no timeout unless the model sets one, so a long build or test run is never cut short, and the user can stop any command.
- Each call runs in a new process with no input, in the project folder, with the environment of the terminal that started Independum. Pagers and the password prompts of Git are turned off. The output is read as UTF-8, without color codes and redrawn progress lines. Stopping a reply ends every program that the command started.
- The model gets the output, the exit code, and the time the command took. An exit code other than zero, a timeout, or a stop reaches it as an error.
- The output that reaches the model stops at 2000 lines or 50 KB, whichever comes first. Past that, the model gets the start and the end, with a note of the lines that are cut and the path of a file that holds all of it in `~/.independum/outputs`. Deleting a chat deletes its outputs. Tokens are not counted, because each provider counts them differently.
- Each call is a step of the reply, as decision 0027 describes. Its label is the description, or else the command. Its status is a timer, the time the command took, or the exit code in orange. Inside are the command, labeled with its shell, and the output. All the turns that answer one prompt show as one reply.
- Commands run without asking for approval for now. Permissions and sandboxing are an open question, studied once the tools are done.

## Consequences

- `@earendil-works/pi-ai` becomes a dependency, because the parameters of a tool are TypeBox schemas, which Pi checks before a call runs.
- The system prompt no longer says that the agent has no tools.
- The next steps of Shell are in the roadmap: a Commands place with a count of running commands beside the message box, settings for the shell and the limits, and commands that run in the background.
