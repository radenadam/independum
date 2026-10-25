const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Describes how long before now a time was, such as "5 minutes ago" or "yesterday". */
export function formatAge(time: number, now: number): string {
  const elapsed = now - time;
  for (const [unit, size] of units) {
    if (elapsed >= size) {
      return relativeTime.format(-Math.floor(elapsed / size), unit);
    }
  }
  return "just now";
}
