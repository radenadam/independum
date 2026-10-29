# Read tool

- Status: accepted, and amended by [decision 0043](0043-file-fingerprints.md), which adds fingerprints, the note of a changed file, and a description that says the line numbers are not part of the file
- Date: 2026-10-29

## Context

The model read files only through Shell, whose output reaches it cut at its start and its end. A file needs a tool that returns exact lines, says exactly what it leaves out, and lets the next read start right there, so nothing is read twice. The maintainer planned Read in full, chose to cut a read only between lines, and asked for every text that it sends to be a model text.

## Decision

- Read takes `path`, and optionally `offset` and `limit` in lines, and `column` and `length` in characters. Each line comes back as its number, a tab, and the line exactly as it is in the file.
- A read returns lines until the end of the file, `limit` lines, `length` characters, or the output limit in the Agent place, whichever comes first. The output limit, which Read shares with Shell, always ends a read between lines, except for a first line that alone is longer than the whole limit, which is cut there. No line is ever shortened otherwise.
- A read that ends before the end of the file ends with a note of exactly what is not shown, such as `[Lines 813 to 5,400 are not shown. The read stops at the output limit of 50 KB.]`, or the columns of a line that it stops inside. A next line that alone passes the limit is named with its length.
- PNG, JPEG, GIF, and WebP images come back as images, fitted by the resizer of Pi, with the note of Pi when it changes their size. A model that cannot take images gets a text instead. A BMP counts as a binary file, because Pi turns BMP into a format that models take only inside its own tool.
- A file with a zero byte in its first 8 KB is binary, and the result says its size. A file that starts with the mark of UTF-16 reads as text. A file that is not valid UTF-8 reads with a note. Line breaks of Windows and the mark of UTF-8 are left out.
- A missing file names up to three similar names in its folder. A missing file, a folder, a binary file, an image that cannot be made small enough, and a read that starts past the end come back as failed results.
- Read takes any path, also outside the project folder, because Shell can read it anyway. Limits come with the permissions and sandbox work.
- The step of a read shows the text that the model read in a block named after the file, or the image, with the range in its label and the lines in its status. Read has its own icon, drawn to `docs/icons.md`, and its own card in the Agent place, where the user can turn it off and edit each of its texts.

## Consequences

- A tool result now carries its images to the UI.
- Read does not yet remember which files it read. Write and Edit need that to refuse a file that the model never read and to catch one that changed since, so it comes with them.
