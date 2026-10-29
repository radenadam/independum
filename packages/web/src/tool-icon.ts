import type { IconName } from "./icon.tsx";

const toolIcons = new Map<string, IconName>([
  ["Shell", "shell"],
  ["CheckCommand", "checkCommand"],
  ["StopCommand", "stopCommand"],
]);

/** Returns the icon of a tool by its name, or a general one for a tool without its own. */
export function toolIconOf(name: string): IconName {
  return toolIcons.get(name) ?? "agent";
}
