# Glossary

These are the names of Independum concepts. Use them exactly in code, UI text, and docs, and avoid the names in the last column. A change that introduces a concept adds it here, in alphabetical order.

In code, a hyphenated term becomes one word, so add-on is `addOn` or `AddOn`, and built-in is `builtIn` or `BuiltIn`. File names keep the hyphen, for example `add-on.ts`.

| Term | Meaning | Avoid |
| --- | --- | --- |
| Add-on | A feature that the user adds to Independum. It follows the same contract as a built-in, so it gets the same visibility and controls. | "plugin", "extension", "custom", "module" |
| Built-in | A feature that ships with Independum. | "core feature", "default feature" |
| Independum | The harness, made of the `independum` command, its server, and its UI. | "the app", "the tool" |
| Maintainer | The person who owns the project and answers its open questions. | "the owner" |
| Pi | The agent SDK that Independum builds on. | "the backend", "the engine" |
| Provider | A service that runs models, such as Anthropic or OpenAI. | "vendor", "backend" |
| User | A person who runs Independum and works with its agent. | "the customer", "the operator" |
