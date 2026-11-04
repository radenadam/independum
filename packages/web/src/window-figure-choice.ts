import { useSyncExternalStore } from "react";

/** A way to draw the context window and what fills it: a zoom bar, or a grid of fine or coarse squares. */
export type WindowFigureChoice = "bar" | "fine" | "coarse";

/** Every way to draw the context window, in the order the switch shows them. */
export const windowFigureChoices: WindowFigureChoice[] = ["bar", "fine", "coarse"];

const storageKey = "independum.windowFigure";
const changeEvent = "independum:window-figure";

/** Returns the way the user picked last, or the zoom bar when there is none. */
function readWindowFigureChoice(): WindowFigureChoice {
  const stored = localStorage.getItem(storageKey);
  return windowFigureChoices.find((choice) => choice === stored) ?? "bar";
}

/** Remembers a way to draw the context window, and draws every figure of it again. */
export function chooseWindowFigure(choice: WindowFigureChoice): void {
  localStorage.setItem(storageKey, choice);
  window.dispatchEvent(new Event(changeEvent));
}

/** Returns the way to draw the context window, and draws again when the user picks another. */
export function useWindowFigureChoice(): WindowFigureChoice {
  return useSyncExternalStore(subscribe, readWindowFigureChoice);
}

// Another tab of Independum that picks a way changes the storage, so this tab follows it too.
function subscribe(onChange: () => void): () => void {
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}
