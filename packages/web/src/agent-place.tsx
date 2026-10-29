import type {
  AgentSummary,
  ChatState,
  ModelSummary,
  SettingsChange,
  TextSummary,
} from "independum/api-types";
import { type ReactElement, useState } from "react";
import styles from "./agent-place.module.css";
import { changeSettings, fetchAgent } from "./chat-api.ts";
import { CodeWell } from "./code-well.tsx";
import { describeThinking } from "./describe-thinking.ts";
import { EditActions } from "./edit-actions.tsx";
import { OutputLimitFields } from "./output-limit-fields.tsx";
import { PiTextList } from "./pi-text-list.tsx";
import { PlaceFrame, PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { ProviderLogo } from "./provider-logo.tsx";
import { TextDialog } from "./text-dialog.tsx";
import { ToolCard } from "./tool-card.tsx";
import { useChatData } from "./use-chat-data.ts";

/** Properties of the Agent place. */
interface AgentPlaceProps {
  chat: ChatState;
  models: ModelSummary[] | undefined;
}

/**
 * Draws how the agent of the open chat is set up: its model, folder, prompts, and tools. Each part
 * opens to edit the texts that the model reads, and goes back to its built-in texts and settings
 * with a reset. What the agent sends and spends shows in the Context place.
 */
export function AgentPlace({ chat, models }: AgentPlaceProps): ReactElement {
  const loaded = useChatData(fetchAgent, chat);
  // A change answers with the agent as it now is, which holds until the agent loads again.
  const [changed, setChanged] = useState<{ from: AgentSummary | undefined; agent: AgentSummary }>();
  const [failure, setFailure] = useState<string | undefined>();
  const agent = changed !== undefined && changed.from === loaded ? changed.agent : loaded;
  // The group of model texts that is open to edit, such as a tool.
  const [editing, setEditing] = useState<string | undefined>();

  function save(next: SettingsChange): Promise<void> {
    setFailure(undefined);
    return changeSettings(next).then((updated) => setChanged({ from: loaded, agent: updated }));
  }

  function change(next: SettingsChange): void {
    save(next).catch(() => setFailure("The setting could not be saved. Try again."));
  }

  function textsOf(group: string): TextSummary[] {
    return agent?.texts.filter((text) => text.group === group) ?? [];
  }

  function isEditedGroup(group: string): boolean {
    return textsOf(group).some((text) => text.isEdited);
  }

  // A part of the agent is marked while the user has changed it, and more so when Independum has
  // changed a built-in text since the user edited it.
  function markOf(group: string, isChanged: boolean): string | undefined {
    if (textsOf(group).some((text) => text.editedFrom !== null)) {
      return "built-in changed";
    }
    return isChanged || isEditedGroup(group) ? "edited" : undefined;
  }

  function builtInTextsOf(group: string): Record<string, null> {
    return Object.fromEntries(textsOf(group).map((text) => [text.id, null]));
  }

  const disabledTools = agent?.tools.filter((tool) => !tool.isEnabled).map((tool) => tool.name);
  const limits = agent?.outputLimits;
  const builtInLimits = agent?.builtInOutputLimits;
  const isLimitEdited =
    isEditedGroup("Output limit") ||
    limits?.maxLines !== builtInLimits?.maxLines ||
    limits?.maxBytes !== builtInLimits?.maxBytes;
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
      <PlaceSection
        heading="System prompt"
        badge="built-in"
        mark={markOf("System prompt", false)}
        actions={
          <EditActions
            editLabel="Edit the system prompt"
            resetLabel="Reset the system prompt to built-in"
            isEdited={isEditedGroup("System prompt")}
            onEdit={() => setEditing("System prompt")}
            onReset={() => change({ texts: builtInTextsOf("System prompt") })}
          />
        }
      >
        <p className={styles.well}>{agent?.systemPrompt}</p>
      </PlaceSection>
      <PlaceSection heading="Added by Pi" badge="read-only">
        <CodeWell code={agent?.addedByPi ?? ""} copyLabel="Copy what Pi adds" />
        <PlaceNote>Pi adds this to the system prompt on every request.</PlaceNote>
      </PlaceSection>
      <PlaceSection heading="Other texts of Pi" badge="read-only">
        <PlaceNote>
          Pi sends each of these when its condition holds, and the mark shows the ones in the last
          request of this chat. Pi has more texts for features that Independum does not use, such as
          skills and branch summaries.
        </PlaceNote>
        {agent === undefined ? null : <PiTextList texts={agent.piTexts} />}
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
              environment={agent.environment}
              environmentSuggestions={agent.environmentSuggestions}
              disabledTools={disabledTools ?? []}
              mark={markOf(
                tool.name,
                !tool.isEnabled ||
                  (tool.name === "Shell" &&
                    (agent.chosenShell !== null || Object.keys(agent.environment).length > 0)),
              )}
              onChange={change}
              onEdit={() => setEditing(tool.name)}
              onReset={() =>
                change({
                  texts: builtInTextsOf(tool.name),
                  disabledTools: (disabledTools ?? []).filter((name) => name !== tool.name),
                  ...(tool.name === "Shell" ? { shell: null, environment: {} } : {}),
                })
              }
            />
          ))
        )}
      </PlaceSection>
      {agent === undefined ? null : (
        <PlaceSection
          heading="Output limit"
          badge="built-in"
          mark={markOf("Output limit", isLimitEdited)}
          actions={
            <EditActions
              editLabel="Edit the note where output is cut"
              resetLabel="Reset the output limit to built-in"
              isEdited={isLimitEdited}
              onEdit={() => setEditing("Output limit")}
              onReset={() =>
                change({
                  outputLimits: agent.builtInOutputLimits,
                  texts: builtInTextsOf("Output limit"),
                })
              }
            />
          }
        >
          <OutputLimitFields
            limits={agent.outputLimits}
            onChange={(outputLimits) => change({ outputLimits })}
          />
        </PlaceSection>
      )}
      {agent === undefined || editing === undefined ? null : (
        <TextDialog
          title={editing}
          texts={textsOf(editing)}
          parameters={agent.tools.find((tool) => tool.name === editing)?.parameters}
          onSave={(texts) => save({ texts })}
          onClose={() => setEditing(undefined)}
        />
      )}
    </PlaceFrame>
  );
}
