# Browser QA

Run `pnpm qa <scenario>` outside workers' sandbox on a coordinator-controlled host. Use `playwright-core` with installed Edge (`channel: "msedge"`) or Chrome (`channel: "chrome"`). `--browser chrome` selects Chrome and `--browser <path>` selects an installed Chromium executable. [Decision 0071](decisions/0071-repository-healing.md) replaces the direct DevTools driver.

## Evidence

Evidence contains screenshots, `values.jsonl` checks, `browser.jsonl` diagnostics, launch details, scenario, and revision. `--base <revision>` chooses the comparison base, defaulting to `main`. Failures preserve `failure.txt` and a screenshot when possible. Clients use isolated contexts. Playwright updates live touch, pixel ratio, and focus without replacing transient UI state. The command owns teardown and retains evidence.

False named checks, exceptions, timeout, navigation failure, browser errors, warnings, and failed requests fail. Deliberately cancelled requests and missing favicon requests are excluded. Independent AI QA inspects screenshots and named values for visual quality and newcomer comprehension beyond a scenario pass. Passing the [local gates](checks.md#local-gates) authorizes landing within settled intent without a person inspecting each change. Receipts bind review to the base, HEAD, source content, and context. Changed source invalidates evidence.

The direct maintainer repairs of 2026-11-13 and 2026-11-14 require framed captures and hit tests through `hoverOn` or `clickOn`. Reveal hover controls by hovering or focusing their owner first. Close covering drawers and scroll content into view. Wait for finite animations before recording geometry baselines. `checkQr` samples rendered PNG pixels, never the SVG source. With `shot`, it checks the QR region in that exact viewport capture before saving the named evidence. After loading and finite animations, it retries blanks for five seconds. Persistent blanks fail and retain their PNG. A separate passing element capture cannot establish viewport evidence. Transient blanks alone establish no product gap.

## Preview

`pnpm preview` starts the real UI and API with Pi's stand-in provider and a temporary home. It prints a loopback link and home path. Ctrl+C closes and removes the preview home. Forced termination can leave temporary files. Pi writes all fixture chats.

Flags shared with QA are `--fixture empty`, `chats`, `hooks`, `compacted`, or `long-history`, `--port <number>`, and `--real-logins`. Chats is default. Empty has no stand-in or saved chats. Hooks declares project scripts. Compacted has eight turns and one compaction after six. Long-history has 240 requests and four compactions after requests 50, 100, 150, and 200, each retaining five earlier turns. Real logins load only through Pi. Follow the product model limits in `AGENTS.md`.

`--url <complete-preview-link>` reuses a preview and keeps it running. It must match the fixture. Otherwise QA owns startup and shutdown. Explicit fixture flags override scenario fixtures. Links retain chat ids. Stand-in responses think, call a local delayed Shell command, and stream a table. Permission, queue, and exact-call scenarios use their named stand-in triggers without a model connection.

## Scenarios

Use `pnpm qa welcome`, `message`, `switch-chats`, `model-menu`, `session`, `compacted`, `long-session`, `settings`, `profiles`, `queue`, `attachments`, `branches`, `context`, `hooks`, `permissions`, `exact-calls`, `headless`, `phone`, `phone-pairing`, or `archived`. Their JSON files own the exact flows and named checks. Run related flows together when they share boundaries. `pnpm qa <path.json>` accepts a custom path relative to the invoking folder.

The gate runs `connect-browser.test.ts` and `check-rendered-qr.test.ts` with `INDEPENDUM_QA_BROWSER` set from `--browser`, defaulting to `msedge`. They exercise diagnostic rejection and persistent blank rejection through the production harness. Requests are intercepted by Playwright. Ordinary `pnpm check` skips these opt-in tests and launches no browser. [Checks](checks.md#local-gates) owns their revision-bound receipts.

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

Separate focus, text, and Enter. Press Send on phones because Enter adds a newline. Close phone drawers before chatting. Fixed delays are rejected. Wait for saves and polling refreshes with bounded conditions and failure messages. Targets await visibility, reachability, and finite animations. Expressions time out after 25 seconds.

The direct maintainer repair of 2026-11-14 requires visible upload and preparation completion before sending. Verify attachments and delivery on the waiting message itself. Draft filenames and empty fields cannot prove acceptance.
