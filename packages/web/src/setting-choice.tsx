import type { ReactElement } from "react";
import { ChoiceGroup } from "./choice-group.tsx";
import styles from "./setting-choice.module.css";

/** Properties of a setting with choices. */
interface SettingChoiceProps<Value extends string> {
  label: string;
  choices: { value: Value; label: string }[];
  current: Value;
  note: string;
  onChoose: (value: Value) => void;
}

/** Draws one setting: its name, a row of its choices with the current one pressed, and a note. */
export function SettingChoice<Value extends string>({
  label,
  choices,
  current,
  note,
  onChoose,
}: SettingChoiceProps<Value>): ReactElement {
  return (
    <div className={styles.section}>
      <h3 className={styles.label}>{label}</h3>
      <ChoiceGroup label={label} choices={choices} current={current} onChoose={onChoose} />
      <p className={styles.note}>{note}</p>
    </div>
  );
}
