import type { ContextSettings } from "./api-types.ts";

/** Reserved UI commands with their descriptions and optional argument hints. */
export const builtInSlashCommands: { name: string; description: string; argumentHint: string }[] = [
  { name: "help", description: "Open command choices.", argumentHint: "" },
  { name: "settings", description: "Open Settings.", argumentHint: "" },
  { name: "session", description: "Open Session.", argumentHint: "" },
  { name: "instructions", description: "Open project instructions.", argumentHint: "" },
  { name: "skills", description: "Open skills.", argumentHint: "[name]" },
  { name: "commands", description: "Open Commands.", argumentHint: "" },
  {
    name: "model",
    description: "Open model choices or choose an exact model.",
    argumentHint: "[provider/model]",
  },
  {
    name: "thinking",
    description: "Open effort choices or choose an exact level.",
    argumentHint: "[level]",
  },
  { name: "new", description: "Start a chat.", argumentHint: "[registered project folder]" },
  { name: "stop", description: "Stop the chat.", argumentHint: "" },
  { name: "compact", description: "Compact the chat.", argumentHint: "[instructions]" },
  { name: "reload", description: "Reload settings and resources.", argumentHint: "" },
];

/** Public Pi seams that remove additions before provider conversion. */
export const piControls = [
  { id: "codingPersona", section: "preamble", label: "Coding persona" },
  { id: "toolSnippets", section: "tools", label: "Tool overview" },
  { id: "rules", section: "rules", label: "Behavioral rules" },
  { id: "documentation", section: "docs", label: "Pi documentation" },
  { id: "workingFolder", section: "cwd", label: "Pi working folder" },
  { id: "systemAddendum", section: "addendum", label: "System addendum" },
  { id: "promptUpdates", section: null, label: "Historical prompt updates" },
  { id: "toolUpdates", section: null, label: "Historical tool updates" },
  { id: "compactionEnvelope", section: null, label: "Compaction envelope" },
  { id: "branchEnvelope", section: null, label: "Branch summary envelope" },
  { id: "userShellContext", section: null, label: "User shell messages" },
  { id: "imageResize", section: null, label: "Automatic image resizing" },
  { id: "compaction", section: null, label: "Compaction" },
  { id: "summarySystem", section: null, label: "Summary system text" },
  { id: "summaryInstructions", section: null, label: "Summary instructions" },
  { id: "summaryFiles", section: null, label: "Summary file operations" },
  { id: "summaryImageLabels", section: null, label: "Summary image labels" },
] as const;

export const builtInContext: ContextSettings = {
  version: 1,
  isBasePromptEnabled: true,
  instructions: { isEnabled: true, names: ["AGENTS.md", "CLAUDE.md"], disabledPaths: [] },
  skills: { isEnabled: true, isAdvertised: true, paths: [], disabledPaths: [] },
  slashCommands: { isEnabled: true, paths: [], disabledPaths: [] },
  pi: {
    disabled: [
      "codingPersona",
      "toolSnippets",
      "rules",
      "documentation",
      "workingFolder",
      "systemAddendum",
    ],
  },
};

/** Resolves optional profile fields and rejects unknown context controls. */
export function readContextSettings(value: unknown): ContextSettings {
  const settings = structuredClone(builtInContext);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("/context: Expected an object.");
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "version") {
      if (entry !== 1) {
        throw new Error("/context/version: Expected version 1.");
      }
    } else if (key === "isBasePromptEnabled") {
      if (typeof entry !== "boolean") {
        throw new Error("/context/isBasePromptEnabled: Expected true or false.");
      }
      settings.isBasePromptEnabled = entry;
    } else if (
      key === "instructions" ||
      key === "skills" ||
      key === "slashCommands" ||
      key === "pi"
    ) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new Error(`/context/${key}: Expected an object.`);
      }
      const target = settings[key] as Record<string, unknown>;
      for (const [field, item] of Object.entries(entry)) {
        const pointer = `/context/${key}/${field}`;
        if (!Object.hasOwn(target, field)) {
          throw new Error(`${pointer}: This field is not supported.`);
        }
        if (typeof target[field] === "boolean") {
          if (typeof item !== "boolean") {
            throw new Error(`${pointer}: Expected true or false.`);
          }
        } else {
          if (
            !Array.isArray(item) ||
            !item.every((name) => typeof name === "string") ||
            new Set(item).size !== item.length
          ) {
            throw new Error(`${pointer}: Expected distinct text values.`);
          }
          if (
            field === "names" &&
            item.some(
              (name: string) =>
                !name ||
                name === "." ||
                name === ".." ||
                /[\\/*?<>:|]/.test(name) ||
                name.includes(String.fromCharCode(0)) ||
                ["auth.json", "models.json", ".env"].includes(name.toLowerCase()),
            )
          ) {
            throw new Error(
              `${pointer}: Expected literal instruction basenames without credential files.`,
            );
          }
          if (
            key === "pi" &&
            item.some((id: string) => !piControls.some((control) => control.id === id))
          ) {
            throw new Error(`${pointer}: This Pi control is unavailable or unknown.`);
          }
        }
        target[field] = item;
      }
    } else {
      throw new Error(`/context/${key}: This field is not supported.`);
    }
  }
  return settings;
}
