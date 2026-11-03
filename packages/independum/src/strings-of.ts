/** Returns every string inside a value, in the order its properties and items hold them. */
export function stringsOf(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.values(value).flatMap(stringsOf);
}
