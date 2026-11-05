# Model settings and compaction

- Status: accepted, with [decision 0061](0061-profiles-and-plain-settings.md) covering model limits
- Date: 2026-11-05

## Context

The model detail shows the limits Pi knows, but the user cannot change them. Pi already accepts a model with different context and output limits, request options for temperature and output, and settings for compaction. The maintainer asks for these controls in the Session place, with settings that apply to every chat and last with the other settings of the user.

## Decision

- Model overrides live in `settings.json` under `modelOverrides`, first keyed by provider and then by model id. The context window and maximum output are positive safe integers. Temperature is a finite nonnegative number. A value equal to its built-in value saves no edit, and resetting removes the override.
- The model detail shows these fields with the built-in values that Pi knows, an edited mark, and a reset for each field. Temperature starts with none when Pi has no catalog value. The fields use the same delayed save as the output limit fields. A decimal field offers a decimal keyboard on a phone.
- Pi has no general flag or range for temperature support. Independum sends the override through Pi's named request option and sampling parameters, so a catalog sampling value cannot win over it. Pi and the provider decide whether it applies. The UI states this limit, and Independum adds no code for a provider or a model.
- Context and output limits apply to copies of catalog models. Open sessions use the changed model through the public agent state, and their request function reads the settings again for every request. A change leaves catalog entries and the saved model selection unchanged. Pi still fits output to the remaining window, and a request with a smaller output cap, such as cache warming, keeps that cap.
- Compaction settings live beside model overrides in `settings.json`. Automatic compaction starts on, with the reserve and newest token budget read from Pi's defaults. The user can turn it off and change either token budget to a nonnegative safe integer, including zero. Settings apply to every open session and to sessions opened later.
- A Compaction row in the Context section opens the switch, both token fields, their built-in values and resets, and Compact now. It states how the reserve sets the threshold and how Pi keeps recent messages near the budget at a message or turn boundary. It points to the texts of Pi for the prompts. These prompts stay read-only as decision 0034 requires.
- Compact now calls Pi's manual compaction with its built-in prompts and no extra instructions. It runs only while the selected chat is idle and has a model, and works with automatic compaction off. The detail shows progress and Pi's failure. A chat being compacted refuses a message or another compaction and stays alive when the user opens another chat.
- The window figure and the message box use the overridden context window. The figure shows the configured reserve while automatic compaction is on, and no reserve while it is off. Changing settings or finishing compaction refreshes the context shown in the browser.

## Consequences

- Pi owns summarization, triggering, overflow recovery, and saved compaction entries. Independum adds storage, model copies, a request wrapper, and controls.
- Compaction requests still bypass Pi's provider request hook, so their raw payloads remain unavailable in the Session place. The prompts remain visible in Texts of Pi, and saved summaries remain visible in the conversation.
- The inventory of the texts of Pi gains the split turn request, the separator and empty history of its saved summary, and optional file lists. Its condition for compaction follows the controls instead of naming a fixed reserve.
- A request already in progress finishes with its original settings. Later requests use the changes, including later requests of a chat running beside the open chat.
- Changes to individual fields merge with the saved settings, and file writes run in order, so editing two fields does not lose either edit. A background command that ends during manual compaction waits for Pi to become idle before its note wakes the chat.
- Decisions 0046, 0048, and 0052 keep their model selection, detail, and figure interactions. The roadmap question about whether automatic compaction stays on is answered by the switch and its built-in on state.
