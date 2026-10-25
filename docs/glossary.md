# Glossary

These are the names of Independum concepts. Use them exactly in code, UI text, and docs, and avoid the names in the last column. A change that introduces a concept adds it here, in alphabetical order.

In code, a hyphenated term becomes one word, so add-on is `addOn` or `AddOn`, and built-in is `builtIn` or `BuiltIn`. File names keep the hyphen, for example `add-on.ts`.

| Term | Meaning | Avoid |
| --- | --- | --- |
| Access token | The secret that lets a browser use the Independum server. It is new on every launch. | "password", "API key", "session key" |
| Add-on | A feature that the user adds to Independum. It follows the same contract as a built-in, so it gets the same visibility and controls. | "plugin", "extension", "custom", "module" |
| Built-in | A feature that ships with Independum. | "core feature", "default feature" |
| Chat | The messages between the user and a model, which Pi saves as a session file. | "thread", "conversation", "session" |
| Chat list | The saved chats of the current folder, newest first. | "history", "sessions", "inbox" |
| Independum | The harness, made of the `independum` command, its server, and its UI. | "the app", "the tool" |
| Login | A saved way to reach one provider, from an account sign-in or an API key. | "credential", "connection", "auth" |
| Login session | A login in progress on the server, which streams its questions and steps to the UI. | "auth flow", "login wizard" |
| Maintainer | The person who owns the project and answers its open questions. | "the owner" |
| Margin | The narrow column at the left of a screen, with its commands and places. | "sidebar", "aside", "nav" |
| Model | A model that a provider runs, such as `claude-haiku-5-5`. The user chooses one for each chat. | "LLM", "engine", "AI" |
| Pi | The agent SDK that Independum builds on. | "the backend", "the engine" |
| Place | A kind of thing the user works on, with a command in the margin and a view in the middle of the screen. Chats are the first place. | "tab", "section", "page" |
| Provider | A service that runs models, such as Anthropic or OpenAI. | "vendor", "backend" |
| User | A person who runs Independum and works with its agent. | "the customer", "the operator" |
