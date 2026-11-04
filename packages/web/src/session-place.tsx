import type { ChatState, ContextSummary, ModelSummary, RequestSummary } from "independum/api-types";
import { type CSSProperties, type ReactElement, useLayoutEffect, useRef, useState } from "react";
import {
  AddedByPiDetail,
  isToolChanged,
  PiTextsDetail,
  SystemPromptDetail,
  ToolsDetail,
} from "./agent-details.tsx";
import { CodeWell } from "./code-well.tsx";
import { describeThinking } from "./describe-thinking.ts";
import { describeUsage, usageRatio } from "./describe-usage.ts";
import { Disclosure } from "./disclosure.tsx";
import { Icon } from "./icon.tsx";
import { OneLineTitle } from "./one-line-title.tsx";
import { PlaceFrame, PlaceNote } from "./place-frame.tsx";
import { PlaceRow } from "./place-row.tsx";
import { PlaceSection } from "./place-section.tsx";
import { ProviderLogo } from "./provider-logo.tsx";
import { RequestParts, type ShownLink, sourceNames } from "./request-parts.tsx";
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
  const [isSplit, setIsSplit] = useState(false);

  useLayoutEffect(() => {
    const element = frame.current;
    if (element === null) {
      return;
    }
    const observer = new ResizeObserver(() => setIsSplit(element.clientWidth >= splitWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const view = path.at(-1);
  const parent = path.at(-2);
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
  // The trail names only where back goes, because the detail names itself.
  const detail =
    view === undefined ? undefined : (
      <div className={styles.detail}>
        {isSplit && parent === undefined ? null : (
          <nav className={styles.trail} aria-label="Back">
            <button
              type="button"
              className={styles.back}
              onClick={() => setPath(path.slice(0, -1))}
            >
              <Icon name="expand" size={14} />
              {parent?.title ?? "Session"}
            </button>
          </nav>
        )}
        <PlaceFrame>
          <Detail
            view={view}
            context={context}
            settings={settings}
            onOpen={(next) => setPath([...path, next])}
          />
        </PlaceFrame>
      </div>
    );

  return (
    <div ref={frame} className={styles.place} data-split={isSplit}>
      {isSplit ? (
        <>
          <div className={styles.overview}>{overview}</div>
          <div className={styles.side}>
            {detail ?? <p className={styles.hint}>Open a part of the session to see it here.</p>}
          </div>
        </>
      ) : (
        (detail ?? <div className={styles.overview}>{overview}</div>)
      )}
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
  const model = models?.find(
    (each) => each.providerId === chat.model?.providerId && each.id === chat.model?.id,
  );
  const last = context?.lastUse;
  const total =
    context?.isNextRequest === false && last !== null && last !== undefined
      ? last.tokens.input + last.tokens.cacheRead + last.tokens.cacheWrite
      : undefined;
  const changedTools =
    settings.agent?.tools.filter((tool) => isToolChanged(settings, tool.name)).length ?? 0;

  return (
    <>
      <header className={styles.who}>
        {chat.model === null ? (
          <p className={styles.model}>No model chosen yet</p>
        ) : (
          <p className={styles.model}>
            <ProviderLogo providerId={chat.model.providerId} size={15} />
            <b>{model?.name ?? chat.model.id}</b>
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
        <section className={styles.section}>
          <h3 className={styles.heading}>Use</h3>
          <UsageTable
            columns={[
              { name: "Last reply", use: context.lastUse },
              { name: "Whole chat", use: { tokens: context.tokens, cost: context.cost } },
            ]}
          />
          <p className={styles.muted}>
            {countOf(context.userMessages, "message", "messages")} from you,{" "}
            {countOf(context.assistantMessages, "reply", "replies")},{" "}
            {countOf(context.toolCalls, "tool call", "tool calls")}
          </p>
        </section>
      )}
      <section className={styles.section}>
        <h3 className={styles.heading}>Context window</h3>
        <div
          className={styles.window}
          style={{ "--ratio": usageRatio(context) } as CSSProperties}
        />
        <p className={styles.muted}>{describeUsage(context)}</p>
      </section>
      <section className={styles.request}>
        <h3 className={styles.heading}>
          {context?.isNextRequest === false ? "Last request" : "Next request"}
        </h3>
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
      <div className={styles.more}>
        <PlaceRow
          label="Request history"
          glance={countOf(context?.requests.length ?? 0, "request", "requests")}
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
      </div>
    </>
  );
}

/** Properties of a detail of a session. */
interface DetailProps {
  view: View;
  context: ContextSummary | undefined;
  settings: AgentSettings;
  onOpen: (view: View) => void;
}

function Detail({ view, context, settings, onOpen }: DetailProps): ReactElement {
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
      return <History context={context} onOpen={onOpen} />;
    case "request": {
      const request = context?.requests.find((each) => each.id === link.id);
      return request === undefined || context === undefined ? (
        <PlaceNote>This request is no longer in the chat.</PlaceNote>
      ) : (
        <Request title={view.title} request={request} context={context} />
      );
    }
    default:
      return <PlaceNote>Nothing to show.</PlaceNote>;
  }
}

/** Properties of the history of requests. */
interface HistoryProps {
  context: ContextSummary | undefined;
  onOpen: (view: View) => void;
}

// The newest request comes first, and a change of settings sits right above the request it led to.
function History({ context, onOpen }: HistoryProps): ReactElement {
  const requests = context?.requests ?? [];
  return (
    <PlaceSection heading="Request history">
      {requests.length === 0 ? (
        <PlaceNote>No request yet. Each reply of the model adds one.</PlaceNote>
      ) : (
        <div className={styles.flush}>
          {requests
            .map((request, index) => ({ request, number: index + 1 }))
            .toReversed()
            .map(({ request, number }) => (
              <div key={request.id}>
                {request.changes.map((change) => (
                  <p key={change} className={styles.change}>
                    {change}
                  </p>
                ))}
                <PlaceRow
                  label={`${number}. ${request.inputs.at(-1)?.label ?? "Request"}`}
                  glance={`${timeFormat.format(new Date(request.timestamp))}, ${request.model}, ${numberFormat.format(request.tokens.input + request.tokens.cacheRead + request.tokens.cacheWrite)} in, ${numberFormat.format(request.tokens.output)} out`}
                  onOpen={() =>
                    onOpen({
                      key: `request-${request.id}`,
                      title: `Request ${number}`,
                      link: { kind: "request", id: request.id },
                      text: "",
                    })
                  }
                />
              </div>
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
}

// The newest request is the one the chat sent last, so it shows the request exactly as it went.
function Request({ title, request, context }: RequestProps): ReactElement {
  const entryOf = (id: string): string =>
    JSON.stringify(context.entries.find((entry) => entry.id === id)?.data ?? null, null, 2);
  const isNewest = context.requests.at(-1)?.id === request.id;
  return (
    <>
      <PlaceSection heading={title}>
        <PlaceNote>
          {timeFormat.format(new Date(request.timestamp))}, {request.model}
        </PlaceNote>
      </PlaceSection>
      <PlaceSection heading="What came in">
        {request.changes.map((change) => (
          <PlaceNote key={change}>{change}.</PlaceNote>
        ))}
        {request.inputs.map((input) => (
          <Disclosure
            key={input.entryId}
            label={<OneLineTitle text={`${sourceNames[input.source]}: ${input.label}`} />}
          >
            <CodeWell code={entryOf(input.entryId)} copyLabel="Copy entry" />
          </Disclosure>
        ))}
      </PlaceSection>
      <PlaceSection heading="What came out">
        <Disclosure label={<OneLineTitle text={`Model: ${request.reply}`} />}>
          <CodeWell code={entryOf(request.id)} copyLabel="Copy entry" />
        </Disclosure>
      </PlaceSection>
      <PlaceSection heading="Use">
        <UsageTable columns={[{ name: request.model, use: request }]} />
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
