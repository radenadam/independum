# Added facts

- Status: accepted, with [decision 0061](0061-profiles-and-plain-settings.md) covering fact switches
- Date: 2026-11-05

## Context

The model cannot reliably know its harness, the machine and folder where it works, the local time of a message, or its own knowledge cutoff. The audit of the request found only the harness name and the folder. Pi keeps message timestamps, but its provider requests leave them out. Its model interface has no knowledge cutoff. The maintainer asks for these facts with the visibility and controls of model texts in decision 0033.

## Decision

- Each added fact has a model text and a switch that is on by default. The facts are message time, the harness and its version, Pi and its version, the operating system with its release and architecture, the time zone, the chat folder, and the model's knowledge cutoff.
- The harness facts form one short section of the system prompt. The versions come from the installed packages, and the operating system, its release and architecture come from Node. The time zone is the local zone of the server, and the folder is the folder of the chat.
- Pi's exact system prompt override sends the edited system prompt followed by the enabled facts. This replaces its automatic folder section, so turning off the folder fact leaves no second copy in the request. The built-in system prompt no longer repeats the harness identity or the folder.
- The context event of Pi adds the time before each user message and tool result in the request. It converts the saved timestamp to the server's local zone, including the offset at that instant, in the form `2026-11-05 21:14 +07:00`. It leaves saved messages and the chat display unchanged, and replaying an older message keeps its original instant. Images and result errors keep their content and status.
- The user sets a knowledge cutoff as text in the model detail of Session. It is unset by default. Settings store it by provider and model id, because two providers can use the same model id. Reset removes the value. The cutoff reaches the model only while its fact is on and a value exists for that provider and model. Independum never guesses a cutoff from a model name.
- Every fact uses the model text editor, slots, edited marks, and resets of decision 0033. Resetting a fact restores its text and switch. Resetting the cutoff field unsets only that model's value.
- Session shows the facts as parts where the request holds them. Each part opens the detail of added facts. The system prompt detail also opens that detail and the inventory of Pi texts, so facts that are off and Pi texts that have not been sent remain reachable. The detail has one box with a row for each fact, its switch, and edit and reset actions. Opening a row shows its text. The newest request shows its inputs as sent, with the time prefix, and the saved entry opens below it.

## Consequences

- [Decision 0063](0063-permissions-and-enforced-tool-access.md) adds permission facts and their independent switches.

- Settings gain disabled facts and the cutoffs of models. Existing settings start with every fact on and no cutoffs.
- Pi supplies the request hook, timestamps, exact prompt override, and its version. Independum supplies the formatting and the cutoff setting because Pi has no model cutoff field.
- Decisions 0033, 0034, and 0048 point here for added facts and the replacement of Pi's automatic folder section. The inventory of Pi texts stays read-only.
- Changes reach the next turn of each chat. The time prefix reads the current text and switch for each request.
