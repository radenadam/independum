import type { AgentSummary, ChatState, ModelSummary } from "independum/api-types";
import { type ReactElement, useEffect, useState } from "react";
import styles from "./agent-place.module.css";
import { fetchAgent } from "./chat-api.ts";
import { CopyButton } from "./copy-button.tsx";
import { describeThinking } from "./describe-thinking.ts";
import { Icon } from "./icon.tsx";
import { PlaceSection } from "./place-section.tsx";
import { ProviderLogo } from "./provider-logo.tsx";

/** Properties of the Agent place. */
interface AgentPlaceProps {
  chat: ChatState;
  models: ModelSummary[] | undefined;
}

/**
 * Draws what the agent of the open chat works with: its model, folder, prompts, tools, and the
 * exact request it sent last.
 */
export function AgentPlace({ chat, models }: AgentPlaceProps): ReactElement {
  const [agent, setAgent] = useState<AgentSummary | undefined>();
  const [isRequestShown, setIsRequestShown] = useState(false);
  const modelId = chat.model?.id;

  // biome-ignore lint/correctness/useExhaustiveDependencies: A request goes out with every message, so the place reloads when a reply starts or ends, and when another chat or model takes over.
  useEffect(() => {
    let isCurrent = true;
    fetchAgent().then(
      (loaded) => {
        if (isCurrent) {
          setAgent(loaded);
        }
      },
      () => undefined,
    );
    return () => {
      isCurrent = false;
    };
  }, [chat.id, chat.isReplying, modelId]);

  const current = models?.find(
    (model) => model.providerId === chat.model?.providerId && model.id === modelId,
  );
  const request =
    agent === undefined || agent.lastRequest === null
      ? undefined
      : JSON.stringify(agent.lastRequest, null, 2);

  return (
    <div className={styles.place}>
      <PlaceSection heading="Model">
        {chat.model === null ? (
          <p className={styles.note}>No model chosen yet.</p>
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
        <p className={styles.note}>The agent works here.</p>
      </PlaceSection>
      <PlaceSection heading="System prompt" badge="built-in">
        <p className={styles.well}>{agent?.systemPrompt}</p>
      </PlaceSection>
      <PlaceSection heading="Added by Pi" badge="read-only">
        <pre className={`${styles.well} ${styles.code}`}>{agent?.addedByPi}</pre>
        <p className={styles.note}>Pi adds this to the system prompt on every request.</p>
      </PlaceSection>
      <PlaceSection heading="Tools">
        <p className={styles.note}>
          {agent === undefined || agent.tools.length === 0
            ? "No tools yet."
            : agent.tools.join(", ")}
        </p>
      </PlaceSection>
      <PlaceSection heading="Last request">
        {request === undefined ? (
          <p className={styles.note}>No request yet since this chat opened.</p>
        ) : (
          <>
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={isRequestShown}
              onClick={() => setIsRequestShown(!isRequestShown)}
            >
              {isRequestShown ? "Hide the exact request" : "Show the exact request"}
              <span className={styles.chevron}>
                <Icon name="expand" size={15} />
              </span>
            </button>
            {isRequestShown ? (
              <div className={styles.request}>
                <div className={styles.copy}>
                  <CopyButton text={request} label="Copy request" tipAlign="end" />
                </div>
                <pre className={`${styles.well} ${styles.code} ${styles.requestText}`}>
                  {request}
                </pre>
              </div>
            ) : null}
          </>
        )}
      </PlaceSection>
    </div>
  );
}
