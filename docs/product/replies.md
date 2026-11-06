# Replies

Decisions: [0027](../decisions/0027-steps-in-a-reply.md), [0029](../decisions/0029-own-tools.md), [0032](../decisions/0032-background-commands.md), [0036](../decisions/0036-options-for-commands.md), [0040](../decisions/0040-note-envelope.md), [0047](../decisions/0047-step-groups.md), and [0049](../decisions/0049-turning-raven.md). Steps expose the work between texts of a reply.

## Parts and states

Consecutive assistant messages form one displayed reply. A user message or a note separates replies. A delivered steer occupies its actual place between turns and shows Sent during a reply. Waiting messages are separate from the transcript until delivery, as [decision 0064](../decisions/0064-queue-and-steer.md) describes. Parts keep their order across turns and the message still streaming. Text renders as Markdown, with code blocks, tables, and math. Markdown images become links instead of loading automatically. Consecutive thinking parts join into one thought. Tool calls keep their ids so later progress and results update the same step.

A tool step distinguishes a call being written, approval waiting, execution, completion, failure, and a background command still running. [Approval waiting](permissions.md#approvals-and-api) names and explains the requested access, shows a Shell command, and offers explicit approval lifetimes and Deny inside the same step. Execution time starts after authorization. It shows its description or input as its label, with status and duration where available. Opening reveals input, returned text, images, and any diff. Read shows numbered text or the image the model received. Write and Edit show line changes. Shell shows its command, shell, and output, and offers controls to stop it or move it to the background while it runs in the reply. A quiet running Shell call warns after thirty seconds without output.

Step boxes open and follow the latest lines while their work runs, with a fade above clipped lines. A step that waits for approval, and the group that holds it, show every line instead, so the whole request and its choices stay readable. They fold when work ends. A user's open or closed choice overrides that automatic state. Show in chat from Commands opens the step and any containing group, scrolls it into view, and briefly highlights it. A box without a body does not open.

The chat shows a thinking indicator while a reply waits without new parts or a pending tool call. Completed reply errors appear after text finishes typing. An aborted reply says it was stopped. The jump button appears when the latest message is below the view. A chat at its end stays there when its width changes and text wraps again. Reading earlier messages keeps the scroll position instead. New prompts anchor near the top while the reply fills the room below them.

## Thoughts and groups

Thought labels say Thinking while active, then Thought or Thought for a measured duration. The server times each thinking part between its stream start and end and saves those times in a custom session entry. Restored thoughts without times have no duration. Empty thoughts have no body unless the provider marks them hidden, in which case the body explains that. The raven turns while thinking and faces forward when its row is pointed at or focused. Reduced motion keeps its profile still.

Work between two text segments forms a step group when it has at least two segments and at least one tool call. Thoughts alone and a single segment stay separate. The group counts only calls, opens while the last work runs, and folds afterward unless the user chooses otherwise. Each child keeps its own box state. Notes appear between replies as separate steps and do not join these groups.

## Notes and copy

A background command's completion note shows the text sent to the model, including its source envelope. The note has the completion status and can wake a reply even when the chat is not open. [Tool lifecycle](tools.md#shell) defines when the note is suppressed.

The user message copy button copies its text. A completed reply with text offers formatted HTML with Markdown as the plain text clipboard content, plus explicit Markdown and plain text choices. Reply copying excludes step boxes, thoughts, notes, controls, timestamps, and errors. It joins only the text parts. The action appears after streaming and typing finish and shows the reply's start time and duration when known.

User messages offer Edit message beside Copy. A completed reply to a user prompt has one Reply actions menu for all its turns, including a reply that only reports an error. Retry preserves its submitted prompt and starts another attempt using current agent settings. Retry with another model or effort opens a dialog whose choices stay local until submission. Every saved attempt shows its model and recorded effort, or Unknown effort. Prompt and reply alternatives use [the branch tiles](chats.md#branches). Notes do not acquire a retry for an unrelated earlier prompt.

Selection copying supplies Markdown and HTML while omitting marked step boxes and controls. A selection inside a code block keeps the browser's native copying. Code blocks have their own copy control.

[Attachments](attachments.md) show beside user text as delivery tiles. Copy message includes their names and inline text. Attachment controls, previews, and harness details stay outside reply copying and selection copying.

## Code

- [Reply assembly and selection copying](../../packages/web/src/chat-messages.tsx), [clipboard conversion](../../packages/web/src/clipboard-content.ts), and [Markdown rendering](../../packages/web/src/markdown-text.tsx).
- [Step state](../../packages/web/src/step-box.tsx), [groups](../../packages/web/src/step-group.tsx), [thoughts](../../packages/web/src/thought-box.tsx), and [tool steps and notes](../../packages/web/src/tool-step.tsx).
- [Call descriptions](../../packages/web/src/describe-tool-call.ts), [call bodies](../../packages/web/src/tool-call-body.tsx), and [server stream conversion](../../packages/independum/src/create-chat.ts).

## Known differences from the decisions

- None identified beyond the amendments linked above. Tool result limits are listed on the [tools page](tools.md#known-differences-from-the-decisions).
