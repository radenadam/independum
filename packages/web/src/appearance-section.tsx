import { type ReactElement, useState } from "react";
import styles from "./appearance-section.module.css";
import { ChoiceGroup } from "./choice-group.tsx";
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
      <ChoiceGroup
        label="Theme"
        choices={themeChoices.map((choice) => ({ value: choice, label: labels[choice] }))}
        current={current}
        onChoose={(choice) => {
          applyThemeChoice(choice);
          setCurrent(choice);
        }}
      />
      <p className={styles.note}>System follows the light or dark setting of this computer.</p>
    </div>
  );
}
