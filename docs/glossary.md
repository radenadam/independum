# Glossary

These are the names of Independum concepts. Use them exactly in code, UI text, and docs, and avoid the names in the last column. A change that introduces a concept adds it here, in alphabetical order.

In code, a hyphenated term becomes one word, so add-on is `addOn` or `AddOn`, and built-in is `builtIn` or `BuiltIn`. File names keep the hyphen, for example `add-on.ts`.

| Term | Meaning | Avoid |
| --- | --- | --- |
| Access token | The secret that lets a browser use the Independum server. It is new on every launch. | "password", "API key", "session key" |
| Add-on | A feature that the user adds to Independum. It follows the same contract as a built-in, so it gets the same visibility and controls. | "plugin", "extension", "custom", "module" |
| Agent | The model, prompts, and tools that answer in a chat, run by Pi. Its place in the side panel shows all of it. | "bot", "assistant", "AI" |
| Archived chat | A chat moved out of the sidebar into `~/.independum/sessions/archived`, which the settings list. | "hidden chat", "trash" |
| Background command | A command of the Shell tool that keeps running after its call returns, such as a server, until it ends or something stops it. | "job", "daemon", "detached process" |
| Built-in | A feature that ships with Independum. | "core feature", "default feature" |
| Chat | The messages between the user and a model, which Pi saves as a session file. | "thread", "conversation", "session" |
| Commands | The place in the side panel that lists the commands of the chat, running ones first, and stops them. | "processes", "jobs", "tasks" |
| Context | What the model of a chat works with: its messages, how full its context window is, its tokens and cost, and the raw requests. Its place in the side panel shows all of it. | "session details", "stats", "info" |
| Independum | The harness, made of the `independum` command, its server, and its UI. | "the app", "the tool" |
| Login | A saved way to reach one provider, from an account sign-in or an API key. | "credential", "connection", "auth" |
| Login session | A login in progress on the server, which streams its questions and steps to the UI. | "auth flow", "login wizard" |
| Note | A message that Independum adds to a chat to wake the agent, such as the end of a background command. It shows as a step. | "system message", "injection", "reminder" |
| Maintainer | The person who owns the project and answers its open questions. | "the owner" |
| Model | A model that a provider runs, such as `claude-haiku-5-5`. The user chooses one for each chat. | "LLM", "engine", "AI" |
| Model text | A text that Independum sends to the model, such as the system prompt, the description of a tool, or what a tool says when its timeout fires. The user can edit each one in the Agent place and reset it to its built-in text. | "prompt string", "template", "copy" |
| Pi | The agent SDK that Independum builds on. | "the backend", "the engine" |
| Pinned chat | A chat kept at the top of the sidebar, above the recent chats. | "favorite", "starred" |
| Place | Something that opens in a side panel tab, such as Agent. A terminal, a browser, and files come later. | "tool", "app", "widget" |
| Project | A folder that chats work in. The sidebar lists every project with its chats. | "workspace", "repo", "directory" |
| Recent chats | The five newest chats that are not pinned, listed above the projects. | "history" |
| Provider | A service that runs models, such as Anthropic or OpenAI. | "vendor", "backend" |
| Step | One thing the agent does on its way to a reply, such as thinking or calling a tool. Each step sits in a box of its own, apart from the reply. | "action", "activity", "trace" |
| Shell | The tool that runs a command in the shell of the user, such as PowerShell or Bash. | "terminal", "bash tool", "exec" |
| Side panel | The column at the right of the working screen, which holds tabs with places. | "details panel", "inspector" |
| Sidebar | The column at the left of the working screen, with New chat, the search, the projects, and Settings. | "margin", "nav", "menu" |
| Slot | A name in braces in a model text, such as `{id}`, where Independum puts a value when it sends the text. | "placeholder", "variable", "token" |
| User | A person who runs Independum and works with its agent. | "the customer", "the operator" |
| Working screen | The screen where the user works with the agent, with the sidebar, the chat, and the side panel. | "main screen", "dashboard", "cockpit" |
