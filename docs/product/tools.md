# Tools

Decisions: [0006](../decisions/0006-built-ins-and-add-ons-share-one-contract.md), [0029](../decisions/0029-own-tools.md), [0031](../decisions/0031-tool-settings.md), [0032](../decisions/0032-background-commands.md), [0033](../decisions/0033-model-texts.md), [0035](../decisions/0035-shells-as-they-are.md), [0036](../decisions/0036-options-for-commands.md), [0037](../decisions/0037-hand-back.md), [0038](../decisions/0038-background-start-check.md), [0039](../decisions/0039-check-command.md), [0040](../decisions/0040-note-envelope.md), [0041](../decisions/0041-windows-jobs.md), [0042](../decisions/0042-read-tool.md), [0043](../decisions/0043-file-fingerprints.md), [0044](../decisions/0044-edit-tool.md), [0045](../decisions/0045-write-tool.md), and [0051](../decisions/0051-chats-run-on-their-own.md). The tools expose file and process operations through Pi.

## Shared contract

The six built-in tools are Read, Write, Edit, Shell, CheckCommand, and StopCommand. `create-chat.ts` constructs them and registers them through a hidden Pi extension. Pi's built-in tools and discovered extensions are off. A tool has a fixed name, editable description, TypeBox parameter schema with editable descriptions, and an execution function. Pi validates calls and schedules execution. Calls on different files can run concurrently. Read, Write, and Edit use Pi's mutation queue for the resolved file.

A result has text and optional images for the model, an optional error flag, and details saved by Pi. Details hold UI data such as diffs, command status, and fingerprints. Chat results and Session's saved entries strip fingerprints before sending details to the UI. Progress reaches the UI separately from the final result. A thrown error becomes a failed tool result through Pi. [Permissions](permissions.md) gates every registered tool and runs Shell and file operations inside their granted boundary in project mode.

Every tool starts enabled in each profile and has an enable switch, text editor, and reset in [Session settings](settings.md#tools-and-model-texts). Disabling excludes it from active tools. Shell is also unavailable when its chosen shell is missing. Registered texts include descriptions, parameter descriptions, result templates, and notes. Some result constituents remain fixed code. No general add-on loader or public contract for add-ons is implemented.

Shared output limits default to 2,000 lines and 51,200 bytes. Settings accept integer line limits from 10 to 1,000,000 and byte limits from 1,024 to 104,857,600. The UI edits kilobytes and saves valid changes after a delay. Read limits returned file text. Shell and CheckCommand limit output through the output log. Other results, status text, and notes do not pass through a universal truncation layer. Limits are taken for each read or when a Shell command starts, so later checks use that command's starting limits.

File tools resolve relative paths against the project and accept absolute paths. Read and Edit reject folders and missing files, suggesting up to three similar names for a missing file. Text decoding supports UTF-8 and marked UTF-16 in either byte order. Otherwise a zero byte in the first 8,192 bytes means binary. Line numbers and columns start at one. Character positions use JavaScript string indices, so a character outside the basic plane occupies two positions.

Read, Write, and Edit save SHA-256 file fingerprints in their result details on the current branch. Text versions keep four-byte line hashes through 100,000 lines, omitting repeated line hashes for an unchanged version. They compare only when a tool touches the file again. Shell reads do not count as seeing a file. A later result can name changed lines, or report a change without lines when hashes are unavailable. A failed Write refusal also records the version it sees.

## Read

Source: [create-read-tool.ts](../../packages/independum/src/tools/create-read-tool.ts), [text-file.ts](../../packages/independum/src/tools/text-file.ts), and [version-of.ts](../../packages/independum/src/tools/version-of.ts).

Parameters are required nonempty `path`, and optional positive integers `offset`, `limit`, `column`, and `length`. Offset defaults to line one and column to position one. Limit counts lines, and length counts returned text characters without line breaks or number prefixes. The starting column applies only to the first line.

Text results put each line after its number and a tab. Reading stops at the requested range, end of file, or output limit. The byte count includes number prefixes and newlines. An output limit cuts between lines unless the first line alone exceeds the byte budget. Explicit length can cut inside a line. The note names omitted lines and columns, a reached output limit, and a next line too large to fit. Starting past the file or first line fails. An empty file returns an empty-file result. Invalid UTF-8 reads with replacement characters and a warning. A byte order mark and line break characters are absent from the numbered view.

PNG, JPEG, GIF, and WebP return an image resized through Pi to the model's image limits, with original dimensions and any resize note. A model without image support receives text instead. Failure to resize fails the call. BMP follows the binary path. The tool reads the whole file into memory before limiting the returned text. Settings are the profile's output limits, enable switch, and model texts.

## Write

Source: [create-write-tool.ts](../../packages/independum/src/tools/create-write-tool.ts).

Parameters are required nonempty `path` and string `content`, which may be empty. A new file creates needed parent folders and writes the supplied UTF-8 content exactly. The result names the file, line count, and first created folder. A folder path fails.

An existing unseen file is refused once with its size. A file changed since this chat saw it is refused once with its new size and changed lines when available. Both refusals are error results with the current fingerprint, so repeating the call can replace that version. Seeing any part through a file tool counts as seeing the file.

A replacement normalizes supplied CRLF to LF, then uses the existing text's most common line break and keeps its encoding and byte order mark. Binary becomes UTF-8 text. The result gives its line count and keeps a text diff and new fingerprint in details. A binary replacement diff has no original binary bytes. No undo control is implemented. Write has no separate output or content size limit. Its settings are its enable switch and model texts.

## Edit

Source: [create-edit-tool.ts](../../packages/independum/src/tools/create-edit-tool.ts).

Required parameters are nonempty `path` and strings `old_string` and `new_string`. Optional parameters are boolean `replace_all` and positive integers `line` and `column`. An empty old string, identical old and new strings, column without line, or line with replace all fails. An empty new string deletes the match.

Matching is exact after CRLF normalization. Without a position, one occurrence is required. Line selects a starting line, and column selects an occurrence on that line when needed. Replace all replaces nonoverlapping occurrences from the start. A miss or ambiguity changes nothing. Diagnostics list at most twenty positions. A near match reports its line range and at most five differences in whitespace, punctuation, or copied Read prefixes. Otherwise a closest numbered excerpt may show. The diagnostic does not apply a fuzzy edit.

The write replaces matched text in the decoded file and preserves other text and existing line breaks. It re-encodes with the file's encoding and byte order mark. New text takes the file's most common line break. Binary and invalid UTF-8 fail. A changed file can still be edited when the exact old string matches, with a change note. The result names old and new line ranges and keeps a diff, added and removed line counts, and the new fingerprint. Settings are its enable switch and model texts.

## Shell

Source: [create-shell-tool.ts](../../packages/independum/src/tools/create-shell-tool.ts), [find-shell.ts](../../packages/independum/src/tools/find-shell.ts), [run-command.ts](../../packages/independum/src/tools/run-command.ts), [create-output-log.ts](../../packages/independum/src/tools/create-output-log.ts), and [create-background-commands.ts](../../packages/independum/src/tools/create-background-commands.ts).

Parameters are required nonempty `command`, optional strings `description` and `workdir`, positive number `timeout` in seconds, boolean `background`, and optional `access`. Access supplies additional path grants and coarse network authority as [permissions](permissions.md#enforcement-and-system-reads) describes. Description labels the UI step. Workdir resolves from the project and must be an existing folder. Each call starts a fresh process with no input. The profile selects minimal or complete environment inheritance and adds its explicit variables. The access token is removed last.

The default is PowerShell on Windows and Bash elsewhere. In project mode Windows selects installed PowerShell 7 or Windows PowerShell 5.1. Git Bash and Store aliases refuse because they cannot start in ProcessContainer. Unrestricted mode keeps PowerShell 7 or Git Bash on Windows. Project discovery does not run a host version query, and the description identifies its unqueried version. PowerShell starts without profiles, in noninteractive mode, with a UTF-8 console output prefix. Bash runs `-c`. No extra pager, Git, encoding, or prompt variables are imposed. There is no pseudo terminal or interactive input.

Timeout is absent unless supplied. User Stop and reply abortion stop a command still held by its call. In project mode the native sandbox owns termination and cleanup. Unrestricted stopping targets process groups on other systems, and Windows jobs with taskkill on Windows. A command that escapes these mechanisms can survive. In particular, Microsoft Store PowerShell can start programs outside its job after the parent is gone. In unrestricted mode, once the shell exits, output drains until 100 milliseconds of quiet or two seconds total, then a result can warn that a descendant still holds output open.

Output merges stdout and stderr as UTF-8, removes terminal codes and redrawn progress lines, and streams latest lines to the UI. Above its limits, the model gets roughly the first fifth and last four fifths with a cut note and full log path. Byte limits preserve whole UTF-8 characters. Short foreground logs are removed on completion. Cut and background logs are retained. Log save failures appear in the cut note. A pending line over one million characters is broken. An unfinished line can recur whole in a later check.

Foreground results include output, exit code or signal, and duration, with timeout or stopped status when applicable. Nonzero exit, timeout, and stop are error results. Details include shell, ending, code, signal, duration, retained output path, and background id where applicable.

`background: true` waits two seconds, returning the complete result if it ends sooner. Otherwise the manager adopts it and returns current output, a numeric id, and log path. The same adoption occurs after hand-back, which defaults to 120 seconds, or when the user moves it. Adoption removes the reply's abort listener, so later reply Stop leaves it running. Ids increase across all chats until restart. Ended commands remain checkable in memory until restart.

Completion adds an enveloped note with status, log path, and last twenty lines, unless the model stopped it or a CheckCommand was waiting when it ended. A retained run receives that note with a new turn, including an unopened chat. A released chat only saves the note for later. [Chats](chats.md#sidebar-and-management) describes command stopping and note suppression during archive and deletion. [Server lifecycle](server.md#chat-lifecycle) describes shutdown.

Shell settings belong to the selected [profile](profiles.md) and choose PowerShell or Bash, output limits, added environment variables, and hand-back. Hand-back accepts zero for never, or integer seconds from 5 to 86,400. The UI offers Never and 1, 2, 5, or 10 minutes. Variable names must start with a letter or underscore and contain only letters, digits, and underscores. Only their names appear in the tool description. Values go into child environments. Suggested variables are optional choices, not automatic settings.

## CheckCommand

Source: [create-check-command-tool.ts](../../packages/independum/src/tools/create-check-command-tool.ts) and the background manager linked under Shell.

Parameters are optional integer `id` of at least one, positive number `wait` in seconds, and nonempty string `until`. Without an id, it lists running background commands of the calling chat with id, command, and elapsed time, or says none run. Wait and until have no effect on that list.

With an id, it returns output since the last take and running status or completion status. It accepts only a command belonging to the calling chat, and unknown ids fail. The first check starts after the output returned by Shell. The shared output log supplies limits and absolute cut-line numbers. Completion details describe how the command ended, but the check result itself is not marked as an error for a command failure.

Without wait, it returns at once. A wait ends on time, command completion, reply abortion, or a literal until match. Until without wait does not hold the call. Matching checks output since the last take, including the saved middle when output is cut. Future matches are found within a line or the current pending line. Aborting a check stops waiting and leaves the command running. An active waiting check suppresses the completion note. Settings are its enable switch and model texts, with limits inherited from the Shell call.

## StopCommand

Source: [create-stop-command-tool.ts](../../packages/independum/src/tools/create-stop-command-tool.ts) and the background manager linked under Shell.

The required parameter is integer `id` of at least one. It aborts that running background command and waits for its end. Unknown or already ended ids fail. The command must belong to the calling chat, as with CheckCommand. Browser controls also require the chat id, even when two chats have the same tool call id. Its result gives completion status, retained output path, and last twenty lines. Details hold the command end. It suppresses the separate completion note. Settings are its enable switch and model texts.

## Known differences from the decisions

- CP-17 records two reproduced contradictions, each tested and marked to fail until its fix. Pi converts call arguments to their schema types before a tool runs, and the permission gate and the validation of hook replacements convert them again. See `packages/independum/src/profiles-runtime.test.ts` and `packages/independum/src/hooks-runtime.test.ts`. Retained Shell logs live under the denied state folder, so Read refuses the path that a cut note names. See `packages/independum/src/sandbox-runtime.test.ts`.
- Decision 0006 describes one contract for built-ins and add-ons. Only direct registration of the built-ins exists, and discovered extensions are disabled. See `packages/independum/src/create-chat.ts:191` and `packages/independum/src/create-chat.ts:586`.
- Decision 0053 accepts the limits of decision 0044. Diagnostics cap positions at twenty and differences at five. See `packages/independum/src/tools/create-edit-tool.ts:345`, `packages/independum/src/tools/create-edit-tool.ts:655`, and `packages/independum/src/tools/create-edit-tool.ts:706`.
- Decision 0053 limits decision 0045 to retained text restoration. A binary replacement retains no original bytes. See `packages/independum/src/tools/create-write-tool.ts:176` and `packages/independum/src/tools/create-write-tool.ts:196`.
- Text editability has additional differences listed in [settings](settings.md#known-differences-from-the-decisions).
