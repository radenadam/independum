# Side panel

Decisions: [0016](../decisions/0016-working-screen.md), [0018](../decisions/0018-columns-on-a-narrow-window.md), [0025](../decisions/0025-resizable-columns.md), [0030](../decisions/0030-commands-place.md), [0048](../decisions/0048-session-place.md), and [0052](../decisions/0052-window-figure.md). Places keep details available beside the chat.

## Tabs and width

New tab offers Session and Commands. Tabs can repeat a place. An external request, such as the context meter, activates an existing tab for that place, uses the active new tab, or creates a tab. Closing the last tab hides the panel and resets it to a new tab. Hiding the panel keeps its tabs. Tabs are component state and do not survive a reload.

The side panel starts at 420 pixels and resizes between 340 and 960 pixels. The sidebar starts at 272 pixels and ranges from 220 to 400. Browser local storage remembers widths. Above phone width, when both columns would leave less than 480 pixels for the chat, opening one closes the other. A narrower window caps a column's displayed width to leave 480 pixels for the chat, and widening the window restores its chosen width. On widths through 760 pixels, the sidebar is a drawer and the side panel covers the screen, with a dismissing scrim over the chat.

## Session overview and details

Session shows the open chat's selected profile, model and thinking effort, project folder name and chat id, token use and cost, and context. A Permissions row opens the selected profile's [policy and runtime detail](permissions.md). The profile row opens its switch review and the shared [profile editor](profiles.md#editors-and-application). The chat detail opens project settings for the default of new chats. The model detail gives Pi's provider, API and base URL, input and output limits, image limits, prices and price tiers per million tokens, and prompt cache duration. It also edits [model settings](settings.md#model-settings-and-compaction). The chat detail gives its full folder, id, dates, and session, output, and last request paths. These paths are text to inspect and copy.

Use compares Last reply with Whole chat. Rows separate input, output, reasoning, cache reads, cache writes, and cost. Last reply sums every assistant turn since the latest user message or custom message. The counts below it count assistant messages as replies. Cost and counts come from Pi, with reasoning summed separately by Independum.

The context shows the last captured request, or an estimate of the next one before any request is captured. The request parts come from provider-independent text matching. Parts keep their order inside a request key, and groups of keys sort as instructions, tools, and messages. Adjacent tools share a row. Model texts and tool controls open through these rows. See [settings](settings.md#tools-and-model-texts). A Compaction row opens its [settings and manual action](settings.md#model-settings-and-compaction), with an edited mark when its settings differ from the built-in values.

Context controls opens the [resource catalog, source editors, and Pi switches](context.md). Captured resources remain separate from pending discovery.

A detail replaces the overview below 720 pixels of panel width. Back restores its scroll position. At 720 pixels or more, the detail sits beside the overview, with separate scrolling and a resizable divider. Closing it restores the full overview. Details open at the top. Changing chats clears the detail path and loads the agent and context by the new chat id. Entry details show the sent text and an As Pi saved it disclosure with complete saved entry data.

## Session figure

A thin bar represents the whole context window, including its override. A funnel expands its used share into a full width bar of request parts. Instructions, tools, compaction summary, and messages have separate colors. The legend gives estimated tokens by kind, free room, and Pi's configured compaction reserve. Turning automatic compaction off removes the reserve. Unknown window size leaves the parts and token count visible without the whole window track.

Parts start with a length estimate. After a reply, their shares scale to the latest model turn's input and cache token count. These are estimates of individual parts, not provider token counts for each one. The figure represents request input. The [message box meter](message-box.md#context-meter) can include the last assistant output too.

The bar and caption start pinned above the scrolling overview. The pin toggles this behavior and is remembered in browser local storage. The legend scrolls away. Hovering a part, request row, or latest compaction links its highlights to the figure. Clicking an instruction or tool segment opens its detail. A message segment opens its matching request when one exists. The figure itself accepts pointer input, and the rows provide keyboard access. Summary segments have no click action.

## Conversation

The conversation is reconstructed from the current session branch, with one row for each assistant message. It is not a complete log of HTTP requests. Each row shows its number, last input source, time, model, and input and output tokens. Five newest rows show immediately. Older stretches between compactions unfold in place.

Model and effort changes and Pi's setup records appear below the request they lead to. Only the final changed value before a request appears. Pending changes wait above the newest row. Compactions show which earlier requests became a summary, and open the saved summary. Summarized requests fade, and messages that Pi keeps whole remain unfaded. Only the latest compaction links its hover to the summary in the figure.

Request details show new inputs, the assistant message, token use, and cost. Only the newest row offers the captured exact request and the count of cache warmings since the run opened. Summary requests have their own capture in the [Compaction detail](context.md#compaction). Matching can omit unknown sections and short unmatched text, so the exact request is the full payload view. [Server model input](server.md#what-reaches-the-model) describes capture and matching limits. Session uses the [same refresh triggers](message-box.md#context-meter) as the meter.

## Commands

Commands lists Shell calls from the open chat, including a call still being written. Running calls come first, including adopted background commands. Earlier calls come newest first. A running command offers its own Stop and, while it runs in the reply, Move to background. A waiting CheckCommand is a tool step, not a Shell command in this list.

A command detail uses the same input, status, output, and images as its chat step. Show in chat opens the step and scrolls to it. Back returns to the list. [Tools](tools.md) defines process control and output retention.

## Code

- [Tabs](../../packages/web/src/side-panel.tsx), [column widths](../../packages/web/src/column-width.ts), and [screen layout](../../packages/web/src/working-screen.tsx).
- [Session and details](../../packages/web/src/session-place.tsx), [parts and linking](../../packages/web/src/context-parts.tsx), [figure](../../packages/web/src/window-figure.tsx), and [conversation](../../packages/web/src/conversation.tsx).
- [Commands](../../packages/web/src/commands-place.tsx), [request reconstruction](../../packages/independum/src/list-requests.ts), and [context data](../../packages/independum/src/create-chat.ts).

## Known differences from the decisions

- Decision 0052 says a figure part opens on click. A summary has no saved entry mapping, so its segment does nothing on click. See `packages/web/src/context-parts.tsx:106` and `packages/web/src/context-parts.tsx:238`.
- Decision 0048 describes a complete parts view. Unknown-only sections and unmatched text shorter than 40 characters can be absent. See `packages/independum/src/summarize-request.ts:81` and `packages/independum/src/summarize-request.ts:445`.
