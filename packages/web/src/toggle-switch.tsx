import type { ReactElement } from "react";
import styles from "./toggle-switch.module.css";
import { useTooltip } from "./use-tooltip.tsx";

/** Properties of a toggle switch. */
interface ToggleSwitchProps {
  label: string;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
}

/** Draws a switch that turns something on or off, orange while it is on. */
export function ToggleSwitch({ label, isOn, onChange }: ToggleSwitchProps): ReactElement {
  const tip = useTooltip(label);
  return (
    <button
      type="button"
      role="switch"
      className={styles.switch}
      aria-checked={isOn}
      aria-label={label}
      onClick={() => onChange(!isOn)}
      {...tip.handlers}
    >
      <span className={styles.knob} />
      {tip.tooltip}
    </button>
  );
}
