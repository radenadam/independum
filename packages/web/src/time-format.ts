/** Formats a moment as its date and time of day, the way the places show when something happened. */
export const timeFormat: Intl.DateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
