import type { IconName } from "./icon.tsx";

/** Returns the icon of a tool by its name, or a general one for a tool without its own. */
export function toolIconOf(name: string): IconName {
  if (name === "Shell") {
    return "shell";
  }
  return name === "StopCommand" ? "stopCommand" : "agent";
}
