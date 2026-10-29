# File fingerprints

- Status: accepted
- Date: 2026-10-29

## Context

Write and Edit need to know whether the model saw a file and whether the file changed since, for example because the user edited it, and the model is better off when a tool says which lines changed than when it reads the file again. The maintainer asked that this survive a restart, because undo and going back to an earlier point will need the same record, and asked to keep only what is needed instead of copies of files.

## Decision

- Each time Read, Write, or Edit touches a file, its result keeps a fingerprint of the version it saw: a SHA-256 hash of the whole file, and a four-byte hash of each line. The lines are left out when the version is the same as the last one the chat saw. A file with more than 100,000 lines keeps only the hash of the whole file, so the chat file stays small.
- The fingerprints live in the details of the tool results, which Pi saves in the chat file. So they survive a restart, follow the branch of the chat, and need no storage of their own. They never go to the UI.
- Independum does not watch files. A tool compares the file with the version that the chat saw last on its branch only when the model touches the file again.
- When Read finds that a file changed since the chat last saw it, its result ends with a note that names the lines that differ now, such as `[src/app.ts changed since this chat last saw it, at lines 40 to 52 and 88.]`. A place where lines were only removed is named by the line that follows it now. A file over the cap gets the note without lines. Edit and Write use the same record.
- The description of Read now says that Read puts each line after its number and a tab, which are not part of the file, because a file can hold numbers of its own.
- Independum compares the hashes of lines with the `diff` package, which Pi already ships.

## Consequences

- Undo of an edit can later work from the transcript, which holds `old_string`, `new_string`, and the place of each edit. Only a Write that replaces a file needs the change kept, which comes with Write.
- A four-byte hash can miss a changed line in about one of four billion lines. The hash of the whole file still notices the change.
