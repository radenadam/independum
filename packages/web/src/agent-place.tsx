import type { AgentSummary, ChatState, ModelSummary, Settings } from "independum/api-types";
import { type ReactElement, useState } from "react";
import styles from "./agent-place.module.css";
import { changeSettings, fetchAgent } from "./chat-api.ts";
import { CodeWell } from "./code-well.tsx";
import { describeThinking } from "./describe-thinking.ts";
import { OutputLimitFields } from "./output-limit-fields.tsx";
import { PlaceFrame, PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { ProviderLogo } from "./provider-logo.tsx";
import { ToolCard } from "./tool-card.tsx";
import { useChatData } from "./use-chat-data.ts";

/** Properties of the Agent place. */
interface AgentPlaceProps {
  chat: ChatState;
  models: ModelSummary[] | undefined;
}

/**
 * Draws how the agent of the open chat is set up: its model, folder, prompts, and tools. What it
 * sends and spends shows in the Context place.
 */
export function AgentPlace({ chat, models }: AgentPlaceProps): ReactElement {
  const loaded = useChatData(fetchAgent, chat);
  // A change answers with the agent as it now is, which holds until the agent loads again.
  const [changed, setChanged] = useState<{ from: AgentSummary | undefined; agent: AgentSummary }>();
  const [failure, setFailure] = useState<string | undefined>();
  const agent = changed !== undefined && changed.from === loaded ? changed.agent : loaded;

  function change(next: Partial<Settings>): void {
    setFailure(undefined);
    changeSettings(next).then(
      (updated) => setChanged({ from: loaded, agent: updated }),
      () => setFailure("The setting could not be saved. Try again."),
    );
  }
  const current = models?.find(
    (model) => model.providerId === chat.model?.providerId && model.id === chat.model?.id,
  );

  return (
    <PlaceFrame>
      <PlaceSection heading="Model">
        {chat.model === null ? (
          <PlaceNote>No model chosen yet.</PlaceNote>
        ) : (
          <>
            <p className={styles.value}>{current?.name ?? chat.model.id}</p>
            <p className={styles.detail}>
              <ProviderLogo providerId={chat.model.providerId} size={14} />
              {current?.providerName ?? chat.model.providerId},{" "}
              <code className={styles.id}>{chat.model.id}</code>
            </p>
            {chat.thinking === null ? null : (
              <p className={styles.detail}>
                Thinking effort: {describeThinking(chat.thinking.level)}
              </p>
            )}
          </>
        )}
      </PlaceSection>
      <PlaceSection heading="Folder">
        <p className={styles.path}>{chat.folder}</p>
        <PlaceNote>The agent works here.</PlaceNote>
      </PlaceSection>
      <PlaceSection heading="System prompt" badge="built-in">
        <p className={styles.well}>{agent?.systemPrompt}</p>
      </PlaceSection>
      <PlaceSection heading="Added by Pi" badge="read-only">
        <CodeWell code={agent?.addedByPi ?? ""} copyLabel="Copy what Pi adds" />
        <PlaceNote>Pi adds this to the system prompt on every request.</PlaceNote>
      </PlaceSection>
      <PlaceSection heading="Tools" badge="built-in">
        {failure === undefined ? null : <p className={styles.failure}>{failure}</p>}
        {agent === undefined ? (
          <PlaceNote>Loading the tools.</PlaceNote>
        ) : (
          agent.tools.map((tool) => (
            <ToolCard
              key={tool.name}
              tool={tool}
              shells={agent.shells}
              disabledTools={agent.tools.filter((each) => !each.isEnabled).map((each) => each.name)}
              onChange={change}
            />
          ))
        )}
      </PlaceSection>
      {agent === undefined ? null : (
        <PlaceSection heading="Output limit" badge="built-in">
          <OutputLimitFields
            limits={agent.outputLimits}
            onChange={(outputLimits) => change({ outputLimits })}
          />
        </PlaceSection>
      )}
    </PlaceFrame>
  );
}
