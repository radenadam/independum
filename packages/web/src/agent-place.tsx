import type { ChatState, ModelSummary } from "independum/api-types";
import type { ReactElement } from "react";
import styles from "./agent-place.module.css";
import { fetchAgent } from "./chat-api.ts";
import { CodeWell } from "./code-well.tsx";
import { describeThinking } from "./describe-thinking.ts";
import { PlaceFrame, PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { ProviderLogo } from "./provider-logo.tsx";
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
  const agent = useChatData(fetchAgent, chat);
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
      <PlaceSection heading="Tools">
        <PlaceNote>
          {agent === undefined || agent.tools.length === 0
            ? "No tools yet."
            : agent.tools.join(", ")}
        </PlaceNote>
      </PlaceSection>
    </PlaceFrame>
  );
}
