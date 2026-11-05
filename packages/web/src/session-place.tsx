import type { ChatState, ContextSummary, ModelSummary, RequestSummary } from "independum/api-types";
import { type CSSProperties, type ReactElement, useLayoutEffect, useRef, useState } from "react";
import {
  AddedByPiDetail,
  isToolChanged,
  PiTextsDetail,
  SystemPromptDetail,
  ToolsDetail,
} from "./agent-details.tsx";
import { ChatDetail } from "./chat-detail.tsx";
import { CodeWell } from "./code-well.tsx";
import { ColumnHandle } from "./column-handle.tsx";
import { detailWidth, readColumnWidth, saveColumnWidth } from "./column-width.ts";
import { ContextParts, type ShownLink } from "./context-parts.tsx";
import { describeChange } from "./conversation.tsx";
import { describeThinking } from "./describe-thinking.ts";
import { Disclosure } from "./disclosure.tsx";
import { Icon } from "./icon.tsx";
import { ModelDetail } from "./model-detail.tsx";
import { modelNameOf } from "./model-name-of.ts";
import { OneLineTitle } from "./one-line-title.tsx";
import { PlaceBox } from "./place-box.tsx";
import { PlaceFrame, PlaceNote } from "./place-frame.tsx";
import { PlaceRow } from "./place-row.tsx";
import { PlaceSection } from "./place-section.tsx";
import { PlaceTrail } from "./place-trail.tsx";
import { ProviderLogo } from "./provider-logo.tsx";
import styles from "./session-place.module.css";
import { TextDialog } from "./text-dialog.tsx";
import { countOf, UsageTable } from "./usage-table.tsx";
import { type AgentSettings, useAgentSettings } from "./use-agent-settings.ts";

/** Properties of the Session place. */
interface SessionPlaceProps {
  chat: ChatState;
  models: ModelSummary[] | undefined;
  context: ContextSummary | undefined;
  contextFailure: string | undefined;
}

/**
 * What opens from a session: a part of its request, one of its requests or compactions, its model, or
 * its chat.
 */
interface View {
  key: string;
  title: string;
  link: ShownLink | { kind: "model" } | { kind: "chat" };
  text: string;
}

// A panel this wide shows the detail beside the overview instead of in its place.
const splitWidth = 720;
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * Draws everything the open chat runs with: its model and its folder, its use of tokens, and its
 * context, which is the context window and what fills it, the instructions and tools, and every
 * request of its conversation. Each part opens to its detail, which edits the texts that the model
 * reads where Independum writes them.
 */
export function SessionPlace({
  chat,
  models,
  context,
  contextFailure,
}: SessionPlaceProps): ReactElement {
  const settings = useAgentSettings(chat);
  const [path, setPath] = useState<View[]>([]);
  const [pathChatId, setPathChatId] = useState(chat.id);
  if (pathChatId !== chat.id) {
    setPathChatId(chat.id);
    setPath([]);
  }
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [overviewWidth, setOverviewWidth] = useState(() => readColumnWidth("overview"));
  const overviewElement = useRef<HTMLDivElement>(null);
  const overviewTop = useRef(0);

  useLayoutEffect(() => {
    const element = frame.current;
    if (element === null) {
      return;
    }
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const view = path.at(-1);
  const parent = path.at(-2);
  // A wide panel shows an open detail beside the overview, and the overview fills the panel again
  // once the detail closes.
  const isSplit = width >= splitWidth && view !== undefined;
  const isOverviewShown = isSplit || view === undefined;
  const shownOverviewWidth = Math.min(overviewWidth, width - detailWidth);

  // A detail takes the place of the overview in a narrow panel, so the overview comes back scrolled
  // to where it was.
  useLayoutEffect(() => {
    if (isOverviewShown && overviewElement.current !== null) {
      overviewElement.current.scrollTop = overviewTop.current;
    }
  }, [isOverviewShown]);

  const overview = (
    <Overview
      chat={chat}
      models={models}
      context={context}
      contextFailure={contextFailure}
      settings={settings}
      current={path[0]?.key}
      onOpen={(next) => setPath([next])}
    />
  );
  // The trail names only where back goes, because the detail names itself. Beside the overview, a
  // detail closes instead of going back to it. Each detail opens at its top.
  const detail =
    view === undefined ? null : (
      <div key={view.key} className={styles.detail} data-detail>
        <PlaceTrail
          back={
            isSplit && parent === undefined
              ? undefined
              : { label: parent?.title ?? "Session", onBack: () => setPath(path.slice(0, -1)) }
          }
          onClose={isSplit ? () => setPath([]) : undefined}
        />
        <PlaceFrame>
          {settings.failure === undefined ? null : <PlaceNote>{settings.failure}</PlaceNote>}
          <Detail
            view={view}
            folder={chat.folder}
            context={context}
            models={models}
            settings={settings}
          />
        </PlaceFrame>
      </div>
    );

  return (
    <div
      ref={frame}
      className={styles.place}
      data-split={isSplit}
      style={{ "--overview-width": `${shownOverviewWidth}px` } as CSSProperties}
    >
      {isOverviewShown ? (
        <div
          ref={overviewElement}
          className={styles.overview}
          onScroll={(event) => {
            overviewTop.current = event.currentTarget.scrollTop;
          }}
        >
          {overview}
        </div>
      ) : null}
      {isSplit ? (
        <div className={styles.edge}>
          <ColumnHandle
            column="overview"
            width={shownOverviewWidth}
            onResize={(next, isDone) => {
              setOverviewWidth(next);
              if (isDone) {
                saveColumnWidth("overview", next);
              }
            }}
          />
        </div>
      ) : null}
      {detail}
      {settings.agent === undefined || settings.editing === undefined ? null : (
        <TextDialog
          title={settings.editing}
          texts={settings.textsOf(settings.editing)}
          parameters={
            settings.agent.tools.find((tool) => tool.name === settings.editing)?.parameters
          }
          onSave={(texts) => settings.save({ texts })}
          onClose={() => settings.setEditing(undefined)}
        />
      )}
    </div>
  );
}

/** Properties of the overview of a session. */
interface OverviewProps {
  chat: ChatState;
  models: ModelSummary[] | undefined;
  context: ContextSummary | undefined;
  contextFailure: string | undefined;
  settings: AgentSettings;
  current: string | undefined;
  onOpen: (view: View) => void;
}

function Overview({
  chat,
  models,
  context,
  contextFailure,
  settings,
  current,
  onOpen,
}: OverviewProps): ReactElement {
  const last = context?.lastUse;
  const total =
    context?.isNextRequest === false && last !== null && last !== undefined
      ? last.tokens.input + last.tokens.cacheRead + last.tokens.cacheWrite
      : undefined;
  const changedTools =
    settings.agent?.tools.filter((tool) => isToolChanged(settings, tool.name)).length ?? 0;

  return (
    <PlaceFrame>
      {settings.failure === undefined ? null : <PlaceNote>{settings.failure}</PlaceNote>}
      <PlaceBox>
        <PlaceRow
          icon={
            chat.model === null ? undefined : (
              <ProviderLogo providerId={chat.model.providerId} size={16} />
            )
          }
          label={
            chat.model === null
              ? "No model chosen yet"
              : modelNameOf(models, chat.model.providerId, chat.model.id)
          }
          glance={
            chat.thinking === null ? undefined : `${describeThinking(chat.thinking.level)} effort`
          }
          isBoxed
          isCurrent={current === "model"}
          onOpen={() => onOpen({ key: "model", title: "Model", link: { kind: "model" }, text: "" })}
        />
        <PlaceRow
          icon={<Icon name="folder" size={16} />}
          label={folderNameOf(chat.folder)}
          glance={
            context?.chatId === undefined || context.chatId === null
              ? "Not saved yet"
              : `Chat ID ${context.chatId}`
          }
          isBoxed
          isCurrent={current === "chat"}
          onOpen={() => onOpen({ key: "chat", title: "Chat", link: { kind: "chat" }, text: "" })}
        />
      </PlaceBox>
      {context === undefined ? null : (
        <PlaceSection heading="Use">
          <UsageTable
            columns={[
              { name: "Last reply", use: context.lastUse },
              { name: "Whole chat", use: { tokens: context.tokens, cost: context.cost } },
            ]}
          />
          <PlaceNote>
            {countOf(context.userMessages, "message", "messages")} from you,{" "}
            {countOf(context.assistantMessages, "reply", "replies")},{" "}
            {countOf(context.toolCalls, "tool call", "tool calls")}
          </PlaceNote>
        </PlaceSection>
      )}
      <PlaceSection heading="Context">
        <PlaceNote>{basisOf(context)}</PlaceNote>
        {context === undefined ? (
          <PlaceNote>{contextFailure ?? "Loading the request."}</PlaceNote>
        ) : (
          <ContextParts
            parts={context.requestParts}
            total={total}
            windowSize={context.contextWindow}
            reserve={context.compactionReserve}
            requests={context.requests}
            pendingChanges={context.pendingChanges}
            models={models}
            changedTools={changedTools}
            isSystemPromptEdited={settings.isEditedGroup("System prompt")}
            current={current}
            onOpen={(key, link, part) => onOpen({ key, title: part.label, link, text: part.text })}
          />
        )}
      </PlaceSection>
    </PlaceFrame>
  );
}

/** Properties of a detail of a session. */
interface DetailProps {
  view: View;
  folder: string;
  context: ContextSummary | undefined;
  models: ModelSummary[] | undefined;
  settings: AgentSettings;
}

function Detail({ view, folder, context, models, settings }: DetailProps): ReactElement {
  const { link } = view;
  switch (link.kind) {
    case "systemPrompt":
      return <SystemPromptDetail settings={settings} />;
    case "addedByPi":
      return (
        <>
          <AddedByPiDetail settings={settings} />
          <PiTextsDetail settings={settings} />
        </>
      );
    case "tool":
    case "tools":
      return <ToolsDetail settings={settings} />;
    case "piText": {
      const text = settings.agent?.piTexts.find((each) => each.id === link.id);
      return (
        <>
          <PlaceSection heading={text?.group ?? view.title} badge="read-only">
            {text === undefined ? null : <PlaceNote>{text.condition}</PlaceNote>}
            <CodeWell code={view.text} copyLabel="Copy the text" />
          </PlaceSection>
          <PiTextsDetail settings={settings} />
        </>
      );
    }
    case "entry": {
      const entry = context?.entries.find((each) => each.id === link.id);
      return (
        <PlaceSection heading={view.title}>
          <CodeWell code={view.text} copyLabel="Copy the text" />
          {entry === undefined ? null : (
            <Disclosure label="As Pi saved it">
              <CodeWell code={JSON.stringify(entry.data, null, 2)} copyLabel="Copy entry" />
            </Disclosure>
          )}
        </PlaceSection>
      );
    }
    case "effort":
      return (
        <PlaceSection heading={view.title} badge="read-only">
          <PlaceNote>
            Pi sends the thinking effort among the messages, for the replies that it applies to.
          </PlaceNote>
          <CodeWell code={view.text} copyLabel="Copy the text" />
        </PlaceSection>
      );
    case "other":
      return (
        <PlaceSection heading={view.title}>
          <PlaceNote>
            Independum does not know this text. The provider or Pi may have added it.
          </PlaceNote>
          <CodeWell code={view.text} copyLabel="Copy the text" />
        </PlaceSection>
      );
    case "compaction": {
      const entry = context?.entries.find((each) => each.id === link.id);
      const change = [
        ...(context?.requests.flatMap((request) => request.changes) ?? []),
        ...(context?.pendingChanges ?? []),
      ].find((each) => each.kind === "compaction" && each.entryId === link.id);
      return (
        <PlaceSection heading="Compaction" badge="read-only">
          {entry === undefined || change === undefined ? (
            <PlaceNote>This compaction is no longer in the chat.</PlaceNote>
          ) : (
            <>
              <PlaceNote>
                {timeFormat.format(new Date(entry.timestamp))}. {describeChange(change, models)}.
                The model reads this summary in place of the messages that it summarized.
              </PlaceNote>
              <CodeWell code={summaryTextOf(entry.data)} copyLabel="Copy the summary" />
              <Disclosure label="As Pi saved it">
                <CodeWell code={JSON.stringify(entry.data, null, 2)} copyLabel="Copy entry" />
              </Disclosure>
            </>
          )}
        </PlaceSection>
      );
    }
    case "model":
      return (
        <ModelDetail
          model={models?.find(
            (each) => each.providerId === context?.provider && each.id === context?.model,
          )}
        />
      );
    case "chat":
      return <ChatDetail folder={folder} context={context} />;
    case "request": {
      const request = context?.requests.find((each) => each.id === link.id);
      return request === undefined || context === undefined ? (
        <PlaceNote>This request is no longer in the chat.</PlaceNote>
      ) : (
        <Request title={view.title} request={request} context={context} models={models} />
      );
    }
    default:
      return <PlaceNote>Nothing to show.</PlaceNote>;
  }
}

/** Properties of one request of the conversation. */
interface RequestProps {
  title: string;
  request: RequestSummary;
  context: ContextSummary;
  models: ModelSummary[] | undefined;
}

// The newest request is the one the chat sent last, so it shows the request exactly as it went.
function Request({ title, request, context, models }: RequestProps): ReactElement {
  const entryOf = (id: string): string =>
    JSON.stringify(context.entries.find((entry) => entry.id === id)?.data ?? null, null, 2);
  const isNewest = context.requests.at(-1)?.id === request.id;
  return (
    <>
      <PlaceSection heading={title}>
        <PlaceNote>
          {timeFormat.format(new Date(request.timestamp))},{" "}
          {modelNameOf(models, request.provider, request.model)}
        </PlaceNote>
      </PlaceSection>
      <PlaceSection heading="What came in">
        {request.changes.map((change) => (
          <PlaceNote key={change.kind}>{describeChange(change, models)}.</PlaceNote>
        ))}
        {request.inputs.map((input) => (
          <Disclosure key={input.entryId} label={<OneLineTitle text={summaryOf(input)} />}>
            <CodeWell code={entryOf(input.entryId)} copyLabel="Copy entry" />
          </Disclosure>
        ))}
      </PlaceSection>
      <PlaceSection heading="What came out">
        <Disclosure label={<OneLineTitle text={summaryOf(request.reply)} />}>
          <CodeWell code={entryOf(request.id)} copyLabel="Copy entry" />
        </Disclosure>
      </PlaceSection>
      <PlaceSection heading="Use">
        <UsageTable columns={[{ name: "This reply", use: request }]} />
      </PlaceSection>
      {isNewest && context.lastRequest !== null ? (
        <PlaceSection heading="Exact request">
          <CodeWell
            code={JSON.stringify(context.lastRequest, null, 2)}
            copyLabel="Copy request"
            isWhole
          />
          {context.cacheWarmings === 0 ? null : (
            <PlaceNote>
              Pi sent it again {countOf(context.cacheWarmings, "time", "times")} with a limit of one
              output token, to keep the prompt cache of the provider warm.
            </PlaceNote>
          )}
        </PlaceSection>
      ) : null}
    </>
  );
}

// The context is the request that went out last, which the next message sends again with itself at
// the end, or, before one went out, the next one as Independum builds it from the chat.
function basisOf(context: ContextSummary | undefined): string {
  return context === undefined || context.isNextRequest
    ? "Not sent yet. It goes with your next message."
    : "Sent last time, and again with your next message.";
}

// A chat goes by the name of its folder, as its project does in the sidebar, and the whole path
// waits in its detail, because a long path would hide the name at its end.
function folderNameOf(folder: string): string {
  return (
    folder
      .split(/[\\/]/)
      .filter((part) => part !== "")
      .at(-1) ?? folder
  );
}

// A compaction that Pi saved holds the summary that the model wrote.
function summaryTextOf(data: unknown): string {
  return typeof data === "object" &&
    data !== null &&
    "summary" in data &&
    typeof data.summary === "string"
    ? data.summary
    : "";
}

function summaryOf({ label, preview }: { label: string; preview: string }): string {
  return preview === "" ? label : `${label}: ${preview}`;
}
