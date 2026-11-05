import { type ReactElement, useState } from "react";
import { SettingChoice } from "./setting-choice.tsx";
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
    <SettingChoice
      label="Theme"
      choices={themeChoices.map((choice) => ({ value: choice, label: labels[choice] }))}
      current={current}
      note="System follows the light or dark setting of this computer."
      onChoose={(choice) => {
        applyThemeChoice(choice);
        setCurrent(choice);
      }}
    />
  );
}
