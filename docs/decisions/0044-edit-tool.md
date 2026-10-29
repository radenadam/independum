# Edit tool

- Status: accepted
- Date: 2026-10-29

## Context

The model changed files only through Shell. The research found that exact text replacement works well for Claude and GPT models alike, and that most failed edits come from text that the model got slightly wrong, such as a space at the end of a line, a tab, a lookalike quote, or the line numbers of Read. Other harnesses hide those mistakes with tolerant matching. The maintainer chose to keep matching exact and to tell the model exactly why a match failed, so it can decide again, and asked for a way to choose one place among identical texts.

## Decision

- Edit takes `path`, `old_string`, `new_string`, and optionally `replace_all`, `line`, and `column`. It is one tool for every model.
- Matching is exact, on the lines of the file as Read shows them. The only thing left out is the carriage return of each line break of Windows, which the model never sees.
- `old_string` must occur once. Otherwise the result names every line where it starts, or every column when they share one line. `line` and `column` choose one of those places, and the text must still match exactly there. `replace_all` replaces every place.
- When `old_string` is not in the file, Edit compares it once more without the differences that are hard to see. When it matches that way, the result names each difference:
  - spaces or tabs at the end or the start of a line
  - a lookalike quote, dash, or space, with its line and column
  - the line numbers of Read at the start of each line
  Otherwise the result shows the closest text, numbered like Read, or only says that the text is missing. Nothing changes in the file.
- An edit writes the file in place, through the queue of Pi for that file. Every byte outside the replaced text stays as it was. The new text takes the line break that the file uses most, and the file keeps its encoding, UTF-8 or UTF-16, and its byte order mark. A file that is not valid UTF-8, or is binary, is refused.
- When the file changed since the chat last saw it, the edit still goes through when `old_string` matches, and the result adds the note of decision 0043 with the lines that differ.
- The result names the lines before and after, such as `Replaced line 2 of fruits.txt with lines 2 to 4.` Its details keep the diff for the UI and the fingerprint of the new version.
- Pi runs the calls of one reply at the same time, so Read waits in the same queue of the file. A read that comes after an edit in the reply then sees the edit.
- The step of an edit shows the diff with the numbers of each line before and after, in new theme colors for added and removed lines, under the whole path, and below it the text that the model got back. Its status counts the lines added and removed. Edit uses the pencil icon, and every text of Edit is a model text.

## Consequences

- Read and Edit share how a file is found, decoded, and named in a result, so Write can use the same.
- A miss costs one more call, and in return the model learns what the file really holds. In a test, Haiku sent one tab too many, read which line differed, and got it right on the second call.
- A column that the model counts itself can land on another copy of the text, which the exact match cannot catch. In a test, Haiku counted the column of the third copy instead of the second, saw it when it read the line again, and fixed it.
