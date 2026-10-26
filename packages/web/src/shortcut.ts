import { useEffect, useEffectEvent } from "react";

/** A key that works together with Ctrl, or with Cmd on a Mac, and sometimes with Shift. */
export interface Shortcut {
  key: string;
  isShift?: boolean;
}

/** The shortcuts of the working screen. */
export const shortcuts: Record<"newChat" | "sidebar" | "settings", Shortcut> = {
  newChat: { key: "o", isShift: true },
  sidebar: { key: "b" },
  settings: { key: "," },
};

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Returns how a shortcut reads on this computer, for example Ctrl+Shift+O. */
export function describeShortcut({ key, isShift = false }: Shortcut): string {
  return [isMac ? "Cmd" : "Ctrl", ...(isShift ? ["Shift"] : []), key.toUpperCase()].join("+");
}

/** Calls back whenever the user presses the shortcut, even while typing in a field. */
export function useShortcut({ key, isShift = false }: Shortcut, onPress: () => void): void {
  const press = useEffectEvent(onPress);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // The modifier key keeps a shortcut apart from typing, so a field does not block it.
      const hasModifier = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (
        !hasModifier ||
        event.altKey ||
        event.shiftKey !== isShift ||
        event.key.toLowerCase() !== key
      ) {
        return;
      }
      event.preventDefault();
      press();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, isShift]);
}
