import type {
  ChatState,
  ContextSummary,
  ModelSummary,
  RequestChange,
  RequestSummary,
} from "independum/api-types";
import {
  type CSSProperties,
  Fragment,
  type ReactElement,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AddedByPiDetail,
  isToolChanged,
  PiTextsDetail,
  SystemPromptDetail,
  ToolsDetail,
} from "./agent-details.tsx";
import { CodeWell } from "./code-well.tsx";
import { ColumnHandle } from "./column-handle.tsx";
import { detailWidth, readColumnWidth, saveColumnWidth } from "./column-width.ts";
import { describeThinking } from "./describe-thinking.ts";
import { describeUsage, usageRatio } from "./describe-usage.ts";
import { Disclosure } from "./disclosure.tsx";
import { Icon } from "./icon.tsx";
import { IconButton } from "./icon-button.tsx";
import { OneLineTitle } from "./one-line-title.tsx";
import { PlaceFrame, PlaceNote } from "./place-frame.tsx";
import { PlaceRow } from "./place-row.tsx";
import { PlaceSection } from "./place-section.tsx";
import { ProviderLogo } from "./provider-logo.tsx";
import { RequestParts, type ShownLink } from "./request-parts.tsx";
import styles from "./session-place.module.css";
import { TextDialog } from "./text-dialog.tsx";
import { countOf, UsageTable } from "./usage-table.tsx";
import { type AgentSettings, useAgentSettings } from "./use-agent-settings.ts";

/** Properties of the Session place. */
interface SessionPlaceProps {
  chat: ChatState;
  models: ModelSummary[] | undefined;
  context: ContextSummary | undefined;
}

/** What opens from a session: a part of its request, its history, or one request of it. */
interface View {
  key: string;
  title: string;
  link: ShownLink | { kind: "history" } | { kind: "request"; id: string };
  text: string;
}

// A panel this wide shows the detail beside the overview instead of in its place.
const splitWidth = 720;
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const numberFormat = new Intl.NumberFormat();

/**
 * Draws everything the open chat runs with: its model, folder, and id, its use of tokens, how full
 * its context window is, the request that the model reads, and the history of its requests. Each
 * part opens to its detail, which edits the texts that the model reads where Independum writes them.
 */
export function SessionPlace({ chat, models, context }: SessionPlaceProps): ReactElement {
  const settings = useAgentSettings(chat);
  const [path, setPath] = useState<View[]>([]);
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
        <nav className={styles.trail} aria-label="Detail">
          {isSplit && parent === undefined ? null : (
            <button
              type="button"
              className={styles.back}
              onClick={() => setPath(path.slice(0, -1))}
            >
              <Icon name="expand" size={14} />
              {parent?.title ?? "Session"}
            </button>
          )}
          {isSplit ? (
            <span className={styles.close}>
              <IconButton icon="close" label="Close" size="small" onClick={() => setPath([])} />
            </span>
          ) : null}
        </nav>
        <PlaceFrame>
          <Detail
            view={view}
            context={context}
            models={models}
            settings={settings}
            onOpen={(next) => setPath([...path, next])}
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
  settings: AgentSettings;
  current: string | undefined;
  onOpen: (view: View) => void;
}

function Overview({
  chat,
  models,
  context,
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
      <header className={styles.who}>
        {chat.model === null ? (
          <p className={styles.model}>No model chosen yet</p>
        ) : (
          <p className={styles.model}>
            <ProviderLogo providerId={chat.model.providerId} size={15} />
            <b>{modelNameOf(models, chat.model.providerId, chat.model.id)}</b>
            {chat.thinking === null ? null : (
              <span className={styles.muted}>{describeThinking(chat.thinking.level)} effort</span>
            )}
          </p>
        )}
        <p className={styles.line}>
          <Icon name="folder" size={14} />
          <OneLineTitle text={chat.folder} />
        </p>
        <p className={styles.line}>
          <span className={styles.label}>Chat ID</span>
          <OneLineTitle text={context?.chatId ?? "Not saved yet"} />
        </p>
      </header>
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
      <PlaceSection heading="Context window">
        <div
          className={styles.window}
          style={{ "--ratio": usageRatio(context) } as CSSProperties}
        />
        <PlaceNote>{describeUsage(context)}</PlaceNote>
      </PlaceSection>
      <section className={styles.request}>
        <h3 className={styles.name}>Context</h3>
        <PlaceNote>{basisOf(context)}</PlaceNote>
        {context === undefined ? (
          <PlaceNote>Loading the request.</PlaceNote>
        ) : (
          <RequestParts
            parts={context.requestParts}
            total={total}
            changedTools={changedTools}
            isSystemPromptEdited={settings.isEditedGroup("System prompt")}
            current={current}
            onOpen={(key, link, part) => onOpen({ key, title: part.label, link, text: part.text })}
          />
        )}
      </section>
      <PlaceSection heading="Request history">
        <PlaceRow
          label={countOf(context?.requests.length ?? 0, "request", "requests")}
          isCurrent={current === "history"}
          onOpen={() =>
            onOpen({
              key: "history",
              title: "Request history",
              link: { kind: "history" },
              text: "",
            })
          }
        />
      </PlaceSection>
    </PlaceFrame>
  );
}

/** Properties of a detail of a session. */
interface DetailProps {
  view: View;
  context: ContextSummary | undefined;
  models: ModelSummary[] | undefined;
  settings: AgentSettings;
  onOpen: (view: View) => void;
}

function Detail({ view, context, models, settings, onOpen }: DetailProps): ReactElement {
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
    case "history":
      return <History context={context} models={models} onOpen={onOpen} />;
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

/** Properties of the history of requests. */
interface HistoryProps {
  context: ContextSummary | undefined;
  models: ModelSummary[] | undefined;
  onOpen: (view: View) => void;
}

// The newest request comes first, and a change of settings sits right above the request it led to.
function History({ context, models, onOpen }: HistoryProps): ReactElement {
  const requests = context?.requests ?? [];
  return (
    <PlaceSection heading="Request history">
      {requests.length === 0 ? (
        <PlaceNote>No request yet. Each reply of the model adds one.</PlaceNote>
      ) : (
        <div className={styles.timeline}>
          {requests
            .map((request, index) => ({ request, number: index + 1 }))
            .toReversed()
            .map(({ request, number }) => (
              <Fragment key={request.id}>
                {request.changes.map((change) => (
                  <p key={change.kind} className={styles.change}>
                    {describeChange(change, models)}
                  </p>
                ))}
                <PlaceRow
                  label={request.inputs.at(-1)?.label ?? "Request"}
                  number={number}
                  glance={`${timeFormat.format(new Date(request.timestamp))}, ${modelNameOf(models, request.provider, request.model)}, ${numberFormat.format(request.tokens.input + request.tokens.cacheRead + request.tokens.cacheWrite)} in, ${numberFormat.format(request.tokens.output)} out`}
                  onOpen={() =>
                    onOpen({
                      key: `request-${request.id}`,
                      title: `Request ${number}`,
                      link: { kind: "request", id: request.id },
                      text: "",
                    })
                  }
                />
              </Fragment>
            ))}
        </div>
      )}
    </PlaceSection>
  );
}

/** Properties of one request of the history. */
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

// A model shows by its name, as the header and the model picker show it, and by its id only when
// the list of models no longer has it.
function modelNameOf(models: ModelSummary[] | undefined, providerId: string, id: string): string {
  return models?.find((each) => each.providerId === providerId && each.id === id)?.name ?? id;
}

function describeChange(change: RequestChange, models: ModelSummary[] | undefined): string {
  switch (change.kind) {
    case "model":
      return `Model set to ${modelNameOf(models, change.provider, change.model)}`;
    case "effort":
      return `Thinking effort set to ${describeThinking(change.effort).toLowerCase()}`;
    default:
      return "Pi recorded the system prompt and the tools";
  }
}

function summaryOf({ label, preview }: { label: string; preview: string }): string {
  return preview === "" ? label : `${label}: ${preview}`;
}
