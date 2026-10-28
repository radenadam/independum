// A slot is a name in braces, such as `{id}`.
const slotPattern = /\{(\w+)\}/g;

/**
 * Puts each value where its name stands in braces. A name in braces that has no value stays as
 * written.
 */
export function fillText(text: string, values: Record<string, string | number>): string {
  return text.replace(slotPattern, (whole, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : whole,
  );
}

/** Returns each name that stands in braces in a text, once. */
export function slotNamesOf(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(slotPattern), (match) => match[1] ?? ""))];
}
