import type { ReactElement } from "react";
import styles from "./agent-details.module.css";
import { CodeWell } from "./code-well.tsx";
import { EditActions } from "./edit-actions.tsx";
import { OutputLimitFields } from "./output-limit-fields.tsx";
import { PiTextList } from "./pi-text-list.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { ToggleSwitch } from "./toggle-switch.tsx";
import { ToolCard } from "./tool-card.tsx";
import type { AgentSettings } from "./use-agent-settings.ts";

/** Properties of a detail of the agent. */
interface AgentDetailProps {
  settings: AgentSettings;
}

/** Draws the system prompt, with the actions that edit it and set it back to built-in. */
export function SystemPromptDetail({ settings }: AgentDetailProps): ReactElement {
  const { agent, markOf, isEditedGroup, setEditing, change, builtInTextsOf } = settings;
  return (
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
      {agent?.contextSettings === undefined ? null : (
        <ToggleSwitch
          label="Send base prompt"
          isOn={agent.contextSettings.isBasePromptEnabled}
          onChange={(isBasePromptEnabled) => {
            if (agent.contextSettings !== undefined) {
              change({ context: { ...agent.contextSettings, isBasePromptEnabled } });
            }
          }}
        />
      )}
    </PlaceSection>
  );
}

/** Draws what Pi adds to the end of the system prompt on every request. */
export function AddedByPiDetail({ settings }: AgentDetailProps): ReactElement {
  return (
    <PlaceSection heading="Added to the system prompt" badge="read-only">
      <CodeWell code={settings.agent?.addedByPi ?? ""} copyLabel="Copy what Pi adds" />
      <PlaceNote>Pi adds this to the system prompt on every request.</PlaceNote>
    </PlaceSection>
  );
}

/** Draws every text that Pi can send, marked when it was in the last request. */
export function PiTextsDetail({ settings }: AgentDetailProps): ReactElement {
  return (
    <PlaceSection heading="Pi context" badge="read-only">
      <PlaceNote>
        Pi sends each of these when its condition holds, and the mark shows the ones in the last
        request of this chat. Context controls lists the switches that public Pi APIs support. Each
        remaining text states its unavailable control and source.
      </PlaceNote>
      {settings.agent === undefined ? null : <PiTextList texts={settings.agent.piTexts} />}
    </PlaceSection>
  );
}

/** Returns whether a tool differs from its built-in setup, such as when it is off or edited. */
export function isToolChanged(settings: AgentSettings, name: string): boolean {
  const { agent, markOf } = settings;
  const tool = agent?.tools.find((each) => each.name === name);
  if (agent === undefined || tool === undefined) {
    return false;
  }
  const isShellSet =
    name === "Shell" &&
    (agent.chosenShell !== null ||
      agent.handBackSeconds !== agent.builtInHandBackSeconds ||
      Object.keys(agent.environment).length > 0);
  return markOf(name, !tool.isEnabled || isShellSet) !== undefined;
}

/** Draws every tool in a card, and the output limit that applies to all of them. */
export function ToolsDetail({ settings }: AgentDetailProps): ReactElement {
  const { agent, markOf, isEditedGroup, setEditing, change, builtInTextsOf } = settings;
  if (agent === undefined) {
    return <PlaceNote>Loading the tools.</PlaceNote>;
  }
  const limits = agent.outputLimits;
  const builtInLimits = agent.builtInOutputLimits;
  const isLimitEdited =
    isEditedGroup("Output limit") ||
    limits.maxLines !== builtInLimits.maxLines ||
    limits.maxBytes !== builtInLimits.maxBytes;
  return (
    <>
      <PlaceSection heading="Tools" badge="built-in">
        {agent.tools.map((tool) => (
          <ToolCard
            key={tool.name}
            tool={tool}
            shells={agent.shells}
            handBackSeconds={agent.handBackSeconds}
            environment={agent.environment}
            environmentSuggestions={agent.environmentSuggestions}
            mark={isToolChanged(settings, tool.name) ? markOf(tool.name, true) : undefined}
            onChange={change}
            onEdit={() => setEditing(tool.name)}
            onReset={() =>
              change({
                texts: builtInTextsOf(tool.name),
                tool: { name: tool.name, isEnabled: true },
                ...(tool.name === "Shell"
                  ? {
                      shell: null,
                      handBackSeconds: agent.builtInHandBackSeconds,
                      environment: {},
                    }
                  : {}),
              })
            }
          />
        ))}
      </PlaceSection>
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
        <OutputLimitFields limits={limits} onChange={(outputLimits) => change({ outputLimits })} />
      </PlaceSection>
    </>
  );
}
