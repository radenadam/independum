import type { ReactElement } from "react";
import styles from "./choice-group.module.css";

/** One choice of a group, which can be out of reach, such as a shell that is not installed. */
interface Choice<Value extends string> {
  value: Value;
  label: string;
  unavailable?: string | undefined;
}

/** Properties of a choice group. */
interface ChoiceGroupProps<Value extends string> {
  label: string;
  choices: Choice<Value>[];
  current: Value;
  onChoose: (value: Value) => void;
}

/** Draws a row of choices with the current one pressed, such as the theme or the shell. */
export function ChoiceGroup<Value extends string>({
  label,
  choices,
  current,
  onChoose,
}: ChoiceGroupProps<Value>): ReactElement {
  return (
    <fieldset className={styles.choices} aria-label={label}>
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          className={styles.choice}
          title={choice.unavailable}
          aria-pressed={choice.value === current}
          disabled={choice.unavailable !== undefined}
          onClick={() => onChoose(choice.value)}
        >
          {choice.label}
        </button>
      ))}
    </fieldset>
  );
}
