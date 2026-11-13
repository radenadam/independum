# Browser QA

Run `pnpm qa <scenario>` on a coordinator-controlled host outside implementation workers' sandbox. The harness uses `playwright-core` with installed Edge through `channel: "msedge"`, or Chrome through `channel: "chrome"`. It downloads no browser. `--browser chrome` selects Chrome and `--browser <path>` selects an explicit installed Chromium executable. [Decision 0071](decisions/0071-repository-healing.md) replaces the old direct DevTools driver. One canonical suite remains in `qa`.

## Evidence

The command prints a fresh temporary output folder with screenshots, named values in `values.jsonl`, diagnostics in `browser.jsonl`, browser launch details, the scenario, and revision metadata. `--base <revision>` chooses the comparison base, defaulting to `main`. Failures preserve `failure.txt` and a screenshot when possible. Clients use isolated contexts. Playwright's protocol session updates live touch, pixel ratio, and focus without replacing transient UI state. Browser and preview teardown belongs to the command. Evidence stays for review.

False named checks, exceptions, timeout, navigation failure, browser errors, warnings, and failed requests fail. Deliberately cancelled requests and the browser's missing favicon request are excluded. A scenario pass does not establish visual quality or newcomer comprehension. The independent AI QA role inspects every screenshot and named value and assesses those qualities. Passing the [local gates](checks.md#local-gates) authorizes landing within settled intent without a person inspecting each change. Gate receipts bind review to the base, HEAD, source content, and context. Changed source invalidates affected evidence.

## Preview

`pnpm preview` starts the real UI and API with Pi's stand-in provider and a temporary home. It prints a loopback link and home path. Ctrl+C closes and removes the preview home. Forced termination can leave temporary files. Pi writes all fixture chats.

Flags shared with QA are `--fixture empty`, `chats`, `hooks`, or `compacted`, `--port <number>`, and `--real-logins`. Chats is default. Empty has no stand-in or saved chats. Hooks declares project scripts. Compacted has eight turns, one compaction after six, and an effort change. It is not a long-history fixture. Real logins load only through Pi, and login changes affect that real store. Follow the product model limits in `AGENTS.md`.

`--url <complete-preview-link>` reuses a running preview and leaves it running. It must have the expected fixture. Otherwise QA owns startup and shutdown. Explicit fixture flags override scenario fixtures. Links retain chat ids. Stand-in responses think, call a local delayed Shell command, and stream a table. Permission and queue scenarios use their named stand-in triggers without a model connection.

## Scenarios

Use `pnpm qa welcome`, `message`, `switch-chats`, `model-menu`, `session`, `compacted`, `settings`, `profiles`, `queue`, `attachments`, `branches`, `context`, `hooks`, `permissions`, `headless`, `phone`, `phone-pairing`, or `archived`. Their JSON files own the exact flows and named checks. Run related flows together when they share boundaries. `pnpm qa <path.json>` accepts a custom path relative to the invoking folder.

Visible changes require the actual built UI, both themes, touch at 360 pixels, relevant long content, recovery, and repeated use. Add coverage when absent. Check development reload when affected. Scenarios starting from configured hooks do not establish creation from empty setup.

`phoneRoute: true` starts an isolated loopback HTTPS proxy fixture. The browser pins its test certificate and resolves `phone.test` locally. It installs no system trust. `--url` instead needs an existing route. Emulation does not establish real phone trust, camera behavior, native enforcement, or firewall behavior.

## Step format

A scenario is a step list with the chats fixture, or `{ fixture, steps, phoneRoute }`. Unknown fields and invalid values fail before launch. Expressions are trusted local code evaluated by Playwright. Targets use visible text, roles, or accessible names, never hashed CSS module classes.

Fields execute in this order:

| Field | Meaning |
| --- | --- |
| `client` | Select an existing named context, initially `owner`. |
| `openClient` | Evaluate its `url` expression, open or reuse `name`, and select it. Invitation URLs stay out of value logs. |
| `size`, `scale` | Viewport pair and optional pixel ratio. Below 500 pixels enables touch and mobile behavior. Resize before navigation when changing device identity. |
| `scheme` | Emulated light or dark scheme. |
| `go` | Navigate to the preview. |
| `run` | Await an expression and record its returned value. Top-level false checks fail. |
| `key` | Playwright key chord such as `Enter`, `Control+Enter`, or `Shift+ArrowRight`. |
| `text` | Insert text into the focused control. |
| `clickOn` | Expression returning a DOM element or coordinate pair. Scroll and verify reachability before clicking. |
| `drag` | Target expression `on` and distance pair `by`, with ten pointer steps. |
| `hoverOn` | Reachable element or coordinate pair. |
| `wait` | Delay from zero to 60000 milliseconds, default 700. |
| `shot` | Save a kebab-case PNG name. |

Focus, text, and Enter normally use separate steps. Touch Enter adds a newline, so press Send on phones. Close phone drawers before using the chat. Prefer a condition promise over a long delay. Targets must be visible and uncovered. Playwright actions time out after 30 seconds and expressions after 25 seconds. Screenshots and named values preserve the existing evidence conventions.
