/** Returns a duration in seconds, such as 3.4 s, 12 s, or 1 min 5 s. */
export function describeDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  if (seconds < 10) {
    return `${seconds.toFixed(1)} s`;
  }
  if (seconds < 60) {
    return `${Math.round(seconds)} s`;
  }
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}
