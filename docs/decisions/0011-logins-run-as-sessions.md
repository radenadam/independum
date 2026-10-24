# Logins run as sessions

- Status: accepted
- Date: 2026-10-24

## Context

Pi supports 42 providers, and their logins differ. Some ask for one API key. Others ask several questions, offer a choice, open a sign-in page in the browser, or show a device code. A fixed form in the UI would fit only some of them.

## Decision

- A login runs on the server as a session. The UI starts one for a provider and a method, and the server streams each step of Pi's login to it: a question (text, secret, choice, or a pasted code), a link to open, a device code, or a note.
- The UI answers questions through the API and can cancel the session. When Pi withdraws a question, because the browser finished that step, the UI withdraws it too.
- The provider list comes from Pi, with Pi's names and sign-in labels. For each provider, it shows whether a login exists and where it comes from, such as a stored credential or an environment variable.
- Pi saves API keys without testing them, so Independum does not claim to check a key.
- Logins that identify the app, such as "Sign in with ChatGPT", get a stable installation id from `~/.independum/installation.json`, created on first use. Pi requires the app to supply it.
- Every other login option keeps Pi's default, so logins introduce themselves exactly as Pi does. Independum maintains no provider behavior of its own.

## Consequences

- Every provider Pi supports can log in, with no code for any single provider in Independum.
- The UI reads the event stream with `fetch`, because `EventSource` cannot send the access token header.
- A wrong key shows up when the first message fails. Testing a key on save would need a request written for each provider, which is the provider work Independum leaves to Pi.
