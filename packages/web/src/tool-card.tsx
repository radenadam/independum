import type {
  EnvironmentSuggestion,
  SettingsChange,
  ShellChoice,
  ShellKind,
  ToolSummary,
} from "independum/api-types";
import type { ReactElement } from "react";
import { Badge } from "./badge.tsx";
import { ChoiceGroup } from "./choice-group.tsx";
import { CodeWell } from "./code-well.tsx";
import { Disclosure } from "./disclosure.tsx";
import { EditActions } from "./edit-actions.tsx";
import { EnvironmentEditor } from "./environment-editor.tsx";
import { Icon } from "./icon.tsx";
import { ToggleSwitch } from "./toggle-switch.tsx";
import styles from "./tool-card.module.css";
import { toolIconOf } from "./tool-icon.ts";

/** Properties of a tool card. */
interface ToolCardProps {
  tool: ToolSummary;
  shells: ShellChoice[];
  environment: Record<string, string>;
  environmentSuggestions: EnvironmentSuggestion[];
  disabledTools: string[];
  mark: string | undefined;
  onChange: (change: SettingsChange) => void;
  onEdit: () => void;
  onReset: () => void;
}

const shellLabels: Record<ShellKind, string> = { powershell: "PowerShell", bash: "Bash" };

/**
 * Draws a tool of the agent with a switch that turns it on or off, the description that the model
 * reads, its settings, and the parameters that the model fills in. A mark says when the user has
 * changed it, its texts open to edit, and a reset brings back everything built in.
 */
export function ToolCard({
  tool,
  shells,
  environment,
  environmentSuggestions,
  disabledTools,
  mark,
  onChange,
  onEdit,
  onReset,
}: ToolCardProps): ReactElement {
  const chosen = shells.find((choice) => choice.isChosen)?.kind ?? "powershell";
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <Icon name={toolIconOf(tool.name)} size={16} />
        <span className={styles.name}>{tool.name}</span>
        {mark === undefined ? null : <Badge label={mark} tone="quiet" />}
        <EditActions
          editLabel={`Edit the texts of ${tool.name}`}
          resetLabel={`Reset ${tool.name} to built-in`}
          isEdited={mark !== undefined}
          onEdit={onEdit}
          onReset={onReset}
        />
        <ToggleSwitch
          label={`Use ${tool.name}`}
          isOn={tool.isEnabled}
          onChange={(isOn) =>
            onChange({
              disabledTools: isOn
                ? disabledTools.filter((name) => name !== tool.name)
                : [...disabledTools, tool.name],
            })
          }
        />
      </div>
      {tool.unavailable === null ? null : <p className={styles.unavailable}>{tool.unavailable}</p>}
      <p className={styles.description}>{tool.description}</p>
      {tool.name === "Shell" ? (
        <ChoiceGroup
          label="Shell"
          choices={shells.map((choice) => ({
            value: choice.kind,
            label: shellLabels[choice.kind],
            unavailable: choice.name === null ? choice.missing : undefined,
          }))}
          current={chosen}
          onChoose={(kind) => onChange({ shell: kind })}
        />
      ) : null}
      {tool.name === "Shell" ? (
        <Disclosure label={`Environment of commands (${Object.keys(environment).length})`}>
          <EnvironmentEditor
            environment={environment}
            suggestions={environmentSuggestions}
            onChange={(next) => onChange({ environment: next })}
          />
        </Disclosure>
      ) : null}
      <Disclosure label="Parameters">
        <CodeWell code={JSON.stringify(tool.parameters, null, 2)} copyLabel="Copy the parameters" />
      </Disclosure>
    </div>
  );
}
