import type { ChatState, ContextSummary, ModelSummary } from "independum/api-types";
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
import { InfoTip } from "./info-tip.tsx";
import { OneLineTitle } from "./one-line-title.tsx";
import { PlaceFrame, PlaceNote } from "./place-frame.tsx";
import { PlaceRow } from "./place-row.tsx";
import { PlaceSection } from "./place-section.tsx";
import { ProviderLogo } from "./provider-logo.tsx";
import { RequestParts, type ShownLink } from "./request-parts.tsx";
import styles from "./session-place.module.css";
import { TextDialog } from "./text-dialog.tsx";
import { UsageTable } from "./usage-table.tsx";
import { type AgentSettings, useAgentSettings } from "./use-agent-settings.ts";

/** Properties of the Session place. */
interface SessionPlaceProps {
  chat: ChatState;
  models: ModelSummary[] | undefined;
  context: ContextSummary | undefined;
}

/** What opens from the overview of a session: a part of it, with its title. */
interface View {
  key: string;
  title: string;
  link: ShownLink | { kind: "raw" | "piTexts" | "entries" };
  text: string;
}

// A panel this wide shows the detail beside the overview instead of in its place.
const splitWidth = 720;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * Draws everything the open chat runs with: its model and folder, how full its context window is,
 * the parts of its last request in the order the model reads them, and its use of tokens. Each part
 * opens to its detail, which edits the texts that the model reads where Independum writes them.
 */
export function SessionPlace({ chat, models, context }: SessionPlaceProps): ReactElement {
  const settings = useAgentSettings(chat);
  const [view, setView] = useState<View | undefined>();
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

  const overview = (
    <Overview
      chat={chat}
      models={models}
      context={context}
      settings={settings}
      current={view?.key}
      onOpen={setView}
    />
  );
  const detail =
    view === undefined ? undefined : (
      <div className={styles.detail}>
        <nav className={styles.trail} aria-label="Where this detail sits">
          {isSplit ? null : (
            <button type="button" className={styles.back} onClick={() => setView(undefined)}>
              <Icon name="expand" size={14} />
              Session
            </button>
          )}
          <OneLineTitle text={view.title} />
        </nav>
        <PlaceFrame>
          <Detail view={view} context={context} settings={settings} />
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
    last === null || last === undefined
      ? undefined
      : last.tokens.input + last.tokens.cacheRead + last.tokens.cacheWrite;
  const changedTools =
    settings.agent?.tools.filter((tool) => isToolChanged(settings, tool.name)).length ?? 0;
  const more: { key: string; title: string; link: View["link"] }[] = [
    { key: "piTexts", title: "Texts of Pi", link: { kind: "piTexts" } },
    { key: "entries", title: "Saved entries", link: { kind: "entries" } },
    { key: "raw", title: "Raw request", link: { kind: "raw" } },
  ];

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
        <p className={styles.folder}>
          <Icon name="folder" size={14} />
          <OneLineTitle text={chat.folder} />
        </p>
      </header>
      <section className={styles.section}>
        <h3 className={styles.heading}>
          Context window
          <InfoTip text="How much of the window of the model this chat fills, counted after the latest reply. Pi compacts the chat when it nears the end." />
        </h3>
        <div
          className={styles.window}
          style={{ "--ratio": usageRatio(context) } as CSSProperties}
        />
        <p className={styles.muted}>{describeUsage(context)}</p>
      </section>
      <section className={styles.section} data-flush="true">
        <h3 className={styles.heading}>
          Last request
          <InfoTip text="What the model read with the last request: its instructions, its tools, and the messages, each part in the order Independum sent it. The provider counts the whole request, and the share of each part is an estimate from its length." />
        </h3>
        {context === undefined || context.requestParts.length === 0 ? (
          <div className={styles.empty}>
            <PlaceNote>No request since this chat opened. The next one shows here.</PlaceNote>
            <PlaceRow
              label="System prompt"
              onOpen={() =>
                onOpen({
                  key: "prompt",
                  title: "System prompt",
                  link: { kind: "systemPrompt" },
                  text: "",
                })
              }
            />
            <PlaceRow
              label="Tools"
              onOpen={() =>
                onOpen({ key: "tools", title: "Tools", link: { kind: "tools" }, text: "" })
              }
            />
          </div>
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
      {context === undefined ? null : (
        <section className={styles.section}>
          <h3 className={styles.heading}>Use</h3>
          <UsageTable context={context} />
        </section>
      )}
      <section className={styles.section} data-flush="true">
        <div className={styles.more}>
          {more.map((each) => (
            <PlaceRow
              key={each.key}
              label={each.title}
              isCurrent={current === each.key}
              onOpen={() => onOpen({ ...each, text: "" })}
            />
          ))}
        </div>
      </section>
    </>
  );
}

/** Properties of a detail of a session. */
interface DetailProps {
  view: View;
  context: ContextSummary | undefined;
  settings: AgentSettings;
}

function Detail({ view, context, settings }: DetailProps): ReactElement {
  const { link } = view;
  switch (link.kind) {
    case "systemPrompt":
      return <SystemPromptDetail settings={settings} />;
    case "addedByPi":
      return <AddedByPiDetail settings={settings} />;
    case "tool":
    case "tools":
      return <ToolsDetail settings={settings} />;
    case "piTexts":
      return <PiTextsDetail settings={settings} />;
    case "piText": {
      const text = settings.agent?.piTexts.find((each) => each.id === link.id);
      return (
        <PlaceSection heading={text?.group ?? view.title} badge="read-only">
          {text === undefined ? null : <PlaceNote>{text.condition}</PlaceNote>}
          <CodeWell code={view.text} copyLabel="Copy the text" />
        </PlaceSection>
      );
    }
    case "entry": {
      const entry = context?.entries.find((each) => each.id === link.id);
      return (
        <PlaceSection heading="As it was sent">
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
        <PlaceSection heading="As it was sent">
          <PlaceNote>
            Independum does not know this text. The provider or Pi may have added it.
          </PlaceNote>
          <CodeWell code={view.text} copyLabel="Copy the text" />
        </PlaceSection>
      );
    case "raw":
      return <RawRequest context={context} />;
    case "entries":
      return <SavedEntries context={context} />;
    default:
      return <PlaceNote>Nothing to show.</PlaceNote>;
  }
}

function RawRequest({ context }: { context: ContextSummary | undefined }): ReactElement {
  if (context?.lastRequest === null || context?.lastRequest === undefined) {
    return <PlaceNote>No request yet since this chat opened.</PlaceNote>;
  }
  return (
    <>
      <CodeWell code={JSON.stringify(context.lastRequest, null, 2)} copyLabel="Copy request" />
      {context.cacheWarmings === 0 ? null : (
        <PlaceNote>
          Pi sent it again {context.cacheWarmings} {context.cacheWarmings === 1 ? "time" : "times"}{" "}
          with a limit of one output token, to keep the prompt cache of the provider warm.
        </PlaceNote>
      )}
    </>
  );
}

function SavedEntries({ context }: { context: ContextSummary | undefined }): ReactElement {
  if (context === undefined || context.entries.length === 0) {
    return <PlaceNote>Pi saves the chat with its first message.</PlaceNote>;
  }
  return (
    <ul className={styles.entries}>
      {context.entries.map((entry) => (
        <li key={entry.id}>
          <Disclosure
            label={
              <span className={styles.entry}>
                <span className={styles.kind}>{entry.role ?? entry.type}</span>
                <code className={styles.id}>{entry.id}</code>
                <time className={styles.time} dateTime={entry.timestamp}>
                  {dateFormat.format(new Date(entry.timestamp))}
                </time>
              </span>
            }
          >
            <CodeWell code={JSON.stringify(entry.data, null, 2)} copyLabel="Copy entry" />
          </Disclosure>
        </li>
      ))}
    </ul>
  );
}
