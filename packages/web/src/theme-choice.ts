/** A theme the user can pick, where system follows the operating system. */
export type ThemeChoice = "system" | "light" | "dark";

/** Every theme the user can pick, in the order the switch shows them. */
export const themeChoices: ThemeChoice[] = ["system", "light", "dark"];

const storageKey = "independum.theme";

/** Returns the theme the user picked last, or system when there is none. */
export function readThemeChoice(): ThemeChoice {
  const stored = localStorage.getItem(storageKey);
  return themeChoices.find((choice) => choice === stored) ?? "system";
}

/** Applies a theme to the page and remembers it for the next visit. */
export function applyThemeChoice(choice: ThemeChoice): void {
  localStorage.setItem(storageKey, choice);
  if (choice === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", choice);
  }
}
