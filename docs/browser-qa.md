# Browser QA

Run `pnpm qa message` to start a preview, drive a headless browser, and save evidence. The command finds Edge or Chrome on Windows and macOS, and Edge, Chrome, or Chromium on the Linux command path. It uses the Chrome DevTools protocol through Node's built-in WebSocket, so no browser dependency or download is needed. Pass `--browser <executable-path>` to choose an installed browser.

The command prints a fresh output folder in the system temporary directory. It holds screenshots, `values.jsonl` with each returned value and its step number, `browser.jsonl` with browser errors and warnings, `browser-stderr.txt` with browser process output, and the scenario used. A failure also saves `failure.txt` and, when the page is available, `failure.png`. The browser profile is removed when the command ends. Screenshots and logs stay for review.

An expression that throws, a protocol error, a missing target, or a returned check whose value is `false` fails the scenario. A `run` value can be a boolean or an object with named checks. Any top-level property whose value is `false` fails. Browser errors and warnings also fail the run, except for two requests. A request that the page cancels on purpose, such as an event stream it closes, is no failure. The browser asks for `/favicon.ico` on its own because the page names no icon yet, and that favicon is open work in `docs/roadmap.md`, so its missing file is no failure either. Inspect screenshots even when checks pass, because the browser cannot judge visual quality.

## Preview

`pnpm preview` runs the same UI and API as `pnpm dev`, with Pi's stand-in provider. Development, preview, and QA commands first build the UI for the separate phone listener. Preview prints a loopback link with a new local access token in its fragment and the temporary home path. Stop it with Ctrl+C to close the app and remove the temporary home. A forced process termination can leave temporary files in the system temporary directory.

| Flag | Effect |
| --- | --- |
| `--fixture empty` | Starts with no chats or stand-in provider, so the browser shows the welcome screen unless real logins are loaded. |
| `--fixture chats` | Starts with three short saved chats and the stand-in model selected. This is the default. |
| `--fixture hooks` | Starts saved chats with a project profile that declares request and tool scripts for Session controls. |
| `--fixture compacted` | Starts with eight turns, a compaction after turn six that summarizes the first four turns, and a change of effort. Pi's `SessionManager` writes every entry. |
| `--real-logins` | Loads real logins and model settings through Pi from `~/.independum`. Chats and harness settings stay in the temporary home. Login changes in this preview affect the real Pi login store. |
| `--port <number>` | Chooses a port. The default is `0`, which asks the operating system for a free port. |

Preview links include the selected chat in the `chat` query parameter. A copied URL or reload follows that id. A client without one requests `GET /api/chats/first`. Chat actions and streams use `/api/chats/:id`, and shared project and reply events use `/api/chats/events`.

The stand-in thinks, calls Shell with a three second delay and a fixed line of output, and streams a reply with a table. It makes no model request. Each chat chooses its next response from its transcript, so chats can reply at once. A message containing `Check network permissions.` makes the stand-in request network access for the same local command, which makes no connection. A message containing `Hold queue preview.` delays the stand-in by eight seconds before its first turn, so the queue scenario can submit and stop pending work. Real model calls follow the Real model calls section of `AGENTS.md`.

## Scenarios

| Command | Checks |
| --- | --- |
| `pnpm qa welcome` | The welcome screen and looking around without a login. |
| `pnpm qa message` | Keyboard focus, sending a message, thinking, tool steps, and the completed reply. |
| `pnpm qa switch-chats` | Opening another chat while the original reply finishes in the background, and preserving independent chat ids through the URL and API. |
| `pnpm qa model-menu` | The model search and changing thinking effort while the menu keeps its opening position. |
| `pnpm qa session` | The side panel, Session place, its conversation, and a wide panel after window resizing. |
| `pnpm qa headless` | An addressed prompt, immediate unmet approval reporting, a new chat with a selected profile, independent browser selection, and command line Source details at desktop and 360 pixel widths in both themes. |
| `pnpm qa compacted` | A saved compaction, its summary, and keeping the chat end in view when the panel opens. |
| `pnpm qa settings` | Logins, missing provider logos, and appearance. |
| `pnpm qa profiles` | Profile creation, shared editors, selected chat profile, and 360 pixel layouts in both themes. |
| `pnpm qa queue` | Queue and steer ordering, removable waiting inputs, stop and resume, captured choices, and 360 pixel layouts in both themes. |
| `pnpm qa attachments` | Picker, paste, drop, text, images, binary files, delivery forms, image limitations, original and prepared details, waiting attachments, stop and resume, and both phone themes. |
| `pnpm qa branches` | Edit and cancel with an ordinary draft, literal resend, retry, prompt and reply tiles, descendant selection, reload persistence, and 360 pixel layouts in both themes. Run `queue` alongside it for delivery controls. |
| `pnpm qa context` | Command preview and submission, resource controls, duplicate instruction sources, and phone layouts in both themes. |
| `pnpm qa hooks` | Script hook inventory, switches, model text editing, and 360 pixel layouts in both themes. |
| `pnpm qa permissions` | Permission sections, denied paths and Linux masking, the exact environment name list, the confirmation before unrestricted mode, commands without startup approval, the order of approval choices, chat and project network approvals, revocation and renewed requests, denial, and 360 pixel layouts in both themes. Approval waiting requires a backend that can compile the project policy. |
| `pnpm qa phone` | A 360 pixel phone in both themes, with its sidebar and every settings section. |
| `pnpm qa phone-pairing` | Isolated owner and phone profiles, a local HTTPS proxy fixture, the local QR image and its 360 pixel layouts in both themes, matching-code approval, reload, independent chat selection, self management, owner revocation, and cancellation. |
| `pnpm qa archived` | Archived title tooltips inside Settings and full titles on a 360 pixel touch screen in both themes. |

`pnpm qa <path.json>` runs a custom scenario. Paths are relative to the directory where the command starts. A scenario is either a list of steps, like the original scratch driver, or an object with `fixture` and `steps`. A list uses the `chats` fixture. The fixture can be `empty`, `chats`, `compacted`, or `hooks`.

Pass `--url` to use a preview that already runs and leave it running. Use the whole link printed by `pnpm preview`. That preview needs the fixture expected by the scenario. Without `--url`, QA starts a preview with the scenario's fixture and closes it when it ends. The preview flags in the table also work with `pnpm qa`, and an explicit fixture flag takes precedence over the scenario.

A scenario object can add `phoneRoute: true` to enable an isolated loopback HTTPS proxy and phone backend. QA pins only that fixture's public test certificate in its browser processes and resolves `phone.test` to loopback. It installs no system trust and contacts no external route. This is browser evidence, not proof of real phone certificate trust or firewall behavior. The `--url` mode needs an already configured reachable private HTTPS route instead.

```sh
pnpm qa session --url 'http://127.0.0.1:4871/?chat=CHAT_ID#token=TOKEN'
```

## Step format

Each step can contain several fields. Fields run in the order below, followed by the delay and screenshot. Browser expressions run in the page and can access its DOM. Scenarios are trusted local code with the same authority as a person using the app.

| Field | Value and effect |
| --- | --- |
| `client` | Select an already opened client by name. The first client is `owner`. Each other client has an isolated browser profile. |
| `openClient` | `{ "name": "phone", "url": "expression" }` evaluates a URL in the current client and opens it in the named isolated client, then selects that client. It does not save the URL as a returned value, so pairing invitations stay out of the value log. Reusing a name retains that client's browser storage. |
| `size` | `[width, height]` in CSS pixels. Widths below 500 enable mobile and touch emulation. |
| `scale` | A positive device pixel ratio with `size` in the same step. The default is `1`. |
| `scheme` | `light` or `dark` for the emulated system color scheme. |
| `go` | `true` navigates to the preview link and waits 2500 milliseconds. |
| `run` | A JavaScript expression. Promises are awaited. The return value is saved. Name checks in an object so the evidence says what each value checks. |
| `key` | A Chrome DevTools `Input.dispatchKeyEvent` parameter object without `type`. It sends key down and key up. Use `key`, `code`, and `windowsVirtualKeyCode` for Enter. Modifier bits are Alt `1`, Ctrl `2`, Meta `4`, and Shift `8`. |
| `text` | Text inserted into the focused control. |
| `clickOn` | An expression returning a DOM element or `[x, y]`. It scrolls an element to the middle of the view, as a user would, and fails when another element covers its center. Then it sends mouse movement, press, and release there. |
| `drag` | `{ "on": "element expression", "by": [xDistance, yDistance] }`. It scrolls and checks an element like `clickOn`, and drags from its center through ten points. A control whose visible part lets the pointer through, such as the knob of a slider, takes its point as `[x, y]`, because the part underneath receives the drag. |
| `hoverOn` | An expression returning a DOM element or `[x, y]`. It scrolls and checks an element like `clickOn`, and moves the pointer there. |
| `wait` | Milliseconds after the actions, from `0` to `60000`. The default is `700`. |
| `shot` | A lowercase kebab-case name. It saves `<name>.png` after the delay. |

Focus a control, insert text, and press Enter in separate steps because `key` precedes `text` and `clickOn`. A touch screen adds a new line on Enter, so a phone step presses Send instead. A phone shows the sidebar and the side panel over the chat, so a scenario that narrows the window closes each one before it uses the chat. Use `run` with a promise to wait for a condition instead of adding a long fixed delay. Wait until a control is shown, not only present, because a step box unfolds over a moment and `clickOn` fails while its target is clipped. A browser command times out after 30 seconds. A browser expression times out after 25 seconds. Unknown step fields and invalid values fail before the browser starts.

```json
{
  "fixture": "chats",
  "steps": [
    { "size": [360, 800], "scheme": "dark", "go": true },
    {
      "run": "({ messageVisible: !!document.querySelector('textarea'), phoneFits: document.documentElement.scrollWidth <= 360 })",
      "shot": "phone"
    }
  ]
}
```
