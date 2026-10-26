const names: Record<string, string> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
};

/** Returns the name of a thinking level as the UI shows it, such as Extra high for xhigh. */
export function describeThinking(level: string): string {
  return names[level] ?? `${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}
