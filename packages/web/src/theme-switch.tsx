import { type ReactElement, useState } from "react";
import { applyThemeChoice, readThemeChoice, themeChoices } from "./theme-choice.ts";
import styles from "./theme-switch.module.css";

/** Draws the switch between the system, light, and dark themes. */
export function ThemeSwitch(): ReactElement {
  const [current, setCurrent] = useState(readThemeChoice);

  return (
    <fieldset className={styles.switch} aria-label="Theme">
      {themeChoices.map((choice) => (
        <button
          key={choice}
          type="button"
          className={styles.choice}
          aria-pressed={choice === current}
          onClick={() => {
            applyThemeChoice(choice);
            setCurrent(choice);
          }}
        >
          {choice}
        </button>
      ))}
    </fieldset>
  );
}
