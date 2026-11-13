# Browser QA

Run `pnpm qa <scenario>` on a coordinator-controlled host outside implementation workers' sandbox. The harness uses `playwright-core` with installed Edge through `channel: "msedge"`, or Chrome through `channel: "chrome"`. It downloads no browser. `--browser chrome` selects Chrome and `--browser <path>` selects an explicit installed Chromium executable. [Decision 0071](decisions/0071-repository-healing.md) replaces the old direct DevTools driver.

## Evidence

The command prints a fresh temporary output folder with screenshots, named values in `values.jsonl`, diagnostics in `browser.jsonl`, browser launch details, the scenario, and revision metadata. `--base <revision>` chooses the comparison base, defaulting to `main`. Failures preserve `failure.txt` and a screenshot when possible. Clients use isolated contexts. Playwright's protocol session updates live touch, pixel ratio, and focus without replacing transient UI state. Browser and preview teardown belongs to the command. Evidence stays for review.

False named checks, exceptions, timeout, navigation failure, browser errors, warnings, and failed requests fail. Deliberately cancelled requests and the browser's missing favicon request are excluded. A scenario pass does not establish visual quality or newcomer comprehension. The independent AI QA role inspects every screenshot and named value and assesses those qualities. Passing the [local gates](checks.md#local-gates) authorizes landing within settled intent without a person inspecting each change. Gate receipts bind review to the base, HEAD, source content, and context. Changed source invalidates affected evidence.

The direct maintainer repairs of 2026-11-13 and 2026-11-14 require framed captures and hit tests through `hoverOn` or `clickOn`. Close covering drawers and scroll content into view. `checkQr` samples element screenshot pixels, never the SVG source. After loading and finite animations, it captures until modules and white background appear within five seconds. Persistent blanks fail and retain their PNG. The component probe's transient blank recovers without app changes. No product gap is established.

## Preview

`pnpm preview` starts the real UI and API with Pi's stand-in provider and a temporary home. It prints a loopback link and home path. Ctrl+C closes and removes the preview home. Forced termination can leave temporary files. Pi writes all fixture chats.

Flags shared with QA are `--fixture empty`, `chats`, `hooks`, `compacted`, or `long-history`, `--port <number>`, and `--real-logins`. Chats is default. Empty has no stand-in or saved chats. Hooks declares project scripts. Compacted has eight turns and one compaction after six. Long-history has 240 requests and four compactions after requests 50, 100, 150, and 200, each retaining five earlier turns. Real logins load only through Pi. Follow the product model limits in `AGENTS.md`.

`--url <complete-preview-link>` reuses a running preview and leaves it running. It must have the expected fixture. Otherwise QA owns startup and shutdown. Explicit fixture flags override scenario fixtures. Links retain chat ids. Stand-in responses think, call a local delayed Shell command, and stream a table. Permission and queue scenarios use their named stand-in triggers without a model connection.

## Scenarios

Use `pnpm qa welcome`, `message`, `switch-chats`, `model-menu`, `session`, `compacted`, `long-session`, `settings`, `profiles`, `queue`, `attachments`, `branches`, `context`, `hooks`, `permissions`, `headless`, `phone`, `phone-pairing`, or `archived`. Their JSON files own the exact flows and named checks. Run related flows together when they share boundaries. `pnpm qa <path.json>` accepts a custom path relative to the invoking folder.

On a capable host, set `INDEPENDUM_QA_BROWSER` to `msedge`, `chrome`, or an installed executable path, then run `pnpm exec vitest run packages/independum/src/qa/connect-browser.test.ts`. This opt-in test uses the production connection, runner, and diagnostic rejection. Its page logs an error and warning, throws, and issues requests intercepted by Playwright as network and HTTP failures. Each diagnostic independently rejects the run. Ordinary `pnpm check` skips it and launches no browser.

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
| `reload`, `closePage` | Await reload or navigation to a blank page. |
| `waitFor` | Poll `condition` and record its truthy value with no false fields within `timeoutMs`, at most 25000. Fail with `message`. |
| `run` | Await an expression and record its returned value. False checks fail by name. |
| `key` | Playwright key chord such as `Enter`, `Control+Enter`, or `Shift+ArrowRight`. |
| `text` | Insert text into the focused control. |
| `clickOn` | Expression returning a DOM element or coordinate pair. Scroll and verify reachability before clicking. |
| `drag` | Target expression `on` and distance pair `by`, with ten pointer steps. |
| `hoverOn` | Reachable element or coordinate pair. |
| `checkQr` | After actions, capture element expression `on` to PNG `name` and check its rendered pixels. |
| `shot` | Save a kebab-case PNG name. |

Separate focus, text, and Enter. Touch Enter adds a newline, so press Send on phones. Close phone drawers before chatting. Fixed delays are rejected. Wait for saves and polling refreshes with bounded conditions and failure messages. Targets await visibility, reachability, and finite animations. Expressions time out after 25 seconds.
