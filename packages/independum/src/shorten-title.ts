// A short title fits a sidebar row and the header of a phone, and the tooltip keeps the whole line.
const titleLength = 50;

/**
 * Shortens a title line to about fifty characters at a word boundary, or at the limit inside one
 * longer word, and marks a cut with an ellipsis.
 */
export function shortenTitle(line: string): string {
  const characters = Array.from(line);
  if (characters.length <= titleLength) {
    return line;
  }
  const words = /^(.*\S)\s/s.exec(characters.slice(0, titleLength + 1).join(""))?.[1];
  return `${words ?? characters.slice(0, titleLength).join("")}\u2026`;
}
