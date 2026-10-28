import type { Settings, ShellChoice, ShellKind, ToolSummary } from "independum/api-types";
import type { ReactElement } from "react";
import { ChoiceGroup } from "./choice-group.tsx";
import { CodeWell } from "./code-well.tsx";
import { Disclosure } from "./disclosure.tsx";
import { Icon } from "./icon.tsx";
import { ToggleSwitch } from "./toggle-switch.tsx";
import styles from "./tool-card.module.css";

/** Properties of a tool card. */
interface ToolCardProps {
  tool: ToolSummary;
  shells: ShellChoice[];
  disabledTools: string[];
  onChange: (change: Partial<Settings>) => void;
}

const shellLabels: Record<ShellKind, string> = { powershell: "PowerShell", bash: "Bash" };

/**
 * Draws a tool of the agent with a switch that turns it on or off, the description that the model
 * reads, its settings, and the parameters that the model fills in.
 */
export function ToolCard({ tool, shells, disabledTools, onChange }: ToolCardProps): ReactElement {
  const chosen = shells.find((choice) => choice.isChosen)?.kind ?? "powershell";
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <Icon name={tool.name === "Shell" ? "shell" : "agent"} size={16} />
        <span className={styles.name}>{tool.name}</span>
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
            unavailable:
              choice.name === null
                ? `${shellLabels[choice.kind]} is not installed on this computer.`
                : undefined,
          }))}
          current={chosen}
          onChoose={(kind) => onChange({ shell: kind })}
        />
      ) : null}
      <Disclosure label="Parameters">
        <CodeWell code={JSON.stringify(tool.parameters, null, 2)} copyLabel="Copy the parameters" />
      </Disclosure>
    </div>
  );
}
