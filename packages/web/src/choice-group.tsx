import type { ReactElement } from "react";
import styles from "./choice-group.module.css";
import { useTooltip } from "./use-tooltip.tsx";

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
        <ChoiceButton
          key={choice.value}
          choice={choice}
          isCurrent={choice.value === current}
          onChoose={onChoose}
        />
      ))}
    </fieldset>
  );
}

/** Properties of one choice button. */
interface ChoiceButtonProps<Value extends string> {
  choice: Choice<Value>;
  isCurrent: boolean;
  onChoose: (value: Value) => void;
}

// A choice out of reach stays focusable and hoverable, so its tooltip can say why it is out of reach.
function ChoiceButton<Value extends string>({
  choice,
  isCurrent,
  onChoose,
}: ChoiceButtonProps<Value>): ReactElement {
  const isUnavailable = choice.unavailable !== undefined;
  const tip = useTooltip(choice.unavailable);
  return (
    <button
      type="button"
      className={styles.choice}
      aria-pressed={isCurrent}
      aria-disabled={isUnavailable}
      onClick={() => {
        if (!isUnavailable) {
          onChoose(choice.value);
        }
      }}
      {...tip.handlers}
    >
      {choice.label}
      {tip.tooltip}
    </button>
  );
}
