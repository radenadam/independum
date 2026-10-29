# Write tool

- Status: accepted
- Date: 2026-10-30

## Context

A tool that writes a whole file can erase what the model never saw, such as a file that it did not know existed, or a change that the user made while the model worked. The maintainer agreed that Write may not replace such a file by accident, without forcing the model to read a whole file first, which would fill its context, and without counting on a read through Shell, which Independum cannot see.

## Decision

- Write takes `path` and `content`. It creates a new file with any folders that it needs, exactly as the model sent the content, or replaces a file whole.
- Replacing a file that this chat has not seen fails once with the facts, such as `src/app.ts already exists, with 812 lines, and this chat has not seen it.` Replacing a file that changed since the chat last saw it fails once with the lines that differ now, and how many lines it has, from the fingerprints of decision 0043. Each refusal keeps the fingerprint of the file as it is, so it counts as seeing it, and the same call again goes through. A read of any part of a file, a write, or an edit counts as seeing it too.
- A replaced file keeps its encoding and its byte order mark, and the new content takes the line break that the file uses most. A binary file that is replaced becomes UTF-8.
- The result names the file and how many lines it has now, and names the first folder that Write made. A path that is a folder fails.
- Write uses the queue of Pi for the file, like Read and Edit, so calls on one file run in the order of the reply.
- The step of a new file shows its content with `New, 40 lines` as its status. The step of a replaced file shows its diff, which its details keep, so a later undo can turn the file back. Write has its own icon, drawn to `docs/icons.md`, and every text of Write is a model text.

## Consequences

- The model may need one more call to replace a file that it never touched, and in return the call tells it what it is about to replace.
- A chat that is opened again after a restart still knows what it saw, because the fingerprints live in its results.
