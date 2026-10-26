import { type ReactElement, useState } from "react";
import styles from "./appearance-section.module.css";
import {
  applyThemeChoice,
  readThemeChoice,
  type ThemeChoice,
  themeChoices,
} from "./theme-choice.ts";

const labels: Record<ThemeChoice, string> = { system: "System", light: "Light", dark: "Dark" };

/** Draws the appearance settings, which today hold the choice of theme. */
export function AppearanceSection(): ReactElement {
  const [current, setCurrent] = useState(readThemeChoice);

  return (
    <div className={styles.section}>
      <h3 className={styles.label}>Theme</h3>
      <fieldset className={styles.choices} aria-label="Theme">
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
            {labels[choice]}
          </button>
        ))}
      </fieldset>
      <p className={styles.note}>System follows the light or dark setting of this computer.</p>
    </div>
  );
}
