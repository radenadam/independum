import { type ReactElement, useState } from "react";
import { SettingChoice } from "./setting-choice.tsx";
import {
  applyThemeChoice,
  readThemeChoice,
  type ThemeChoice,
  themeChoices,
} from "./theme-choice.ts";
import {
  chooseWindowFigure,
  useWindowFigureChoice,
  type WindowFigureChoice,
  windowFigureChoices,
} from "./window-figure-choice.ts";

const themeLabels: Record<ThemeChoice, string> = { system: "System", light: "Light", dark: "Dark" };
const figureLabels: Record<WindowFigureChoice, string> = {
  bar: "Zoom bar",
  fine: "Fine grid",
  coarse: "Coarse grid",
};

/** Draws the appearance settings: the theme, and how the Session place draws the context window. */
export function AppearanceSection(): ReactElement {
  const [theme, setTheme] = useState(readThemeChoice);
  const figure = useWindowFigureChoice();

  return (
    <>
      <SettingChoice
        label="Theme"
        choices={themeChoices.map((choice) => ({ value: choice, label: themeLabels[choice] }))}
        current={theme}
        note="System follows the light or dark setting of this computer."
        onChoose={(choice) => {
          applyThemeChoice(choice);
          setTheme(choice);
        }}
      />
      <SettingChoice
        label="Context window"
        choices={windowFigureChoices.map((choice) => ({
          value: choice,
          label: figureLabels[choice],
        }))}
        current={figure}
        note="How the Session place draws the context window and what fills it. A zoom bar opens the part in use to the full width. A grid gives each square the same share of the window, a thousandth or a two hundredth."
        onChoose={chooseWindowFigure}
      />
    </>
  );
}
