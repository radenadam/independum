# Note envelope

- Status: accepted
- Date: 2026-10-29

## Context

A note reaches the model as a user message, so the model could not tell a note from what the user wrote. The maintainer asked for one style for every message that Independum adds to a chat, so the model learns to recognize it, whether it comes from a background command today or from an instruction file later.

## Decision

- Every note is wrapped in one envelope that names its source, for example:

  ```xml
  <independum source="background command 3">
  Background command 3 ended with exit code 0 after 84.2 s. Its output is in ~/.independum/outputs/chat/call.log
  </independum>
  ```

- The envelope and the source of a note about a background command are model texts, so the user can edit them. They show with the texts of Shell until Independum adds another kind of message, and then the envelope moves to a place of its own.
- The step of a note shows the text as the model reads it, envelope included.
- The system prompt does not explain the envelope, because the tag names its source. Pi marks its own sections with tags in the same way.

## Consequences

- A note that is already in a chat keeps the text it was sent with, even after the user edits the envelope.
- In a test through the app, Haiku and Luna each quoted the envelope exactly and named Independum and its background command as the source.
