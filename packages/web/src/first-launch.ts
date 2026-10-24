const storageKey = "independum.greeted";

/** Returns whether this browser has already seen the welcome screen and made a choice. */
export function hasBeenGreeted(): boolean {
  return localStorage.getItem(storageKey) === "true";
}

/** Remembers that this browser has seen the welcome screen. */
export function rememberGreeting(): void {
  localStorage.setItem(storageKey, "true");
}
