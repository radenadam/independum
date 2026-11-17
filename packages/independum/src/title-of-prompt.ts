/**
 * Returns the line that a first prompt gives its chat as a title, which is the first line of text
 * that the user wrote, or the names of its attachments when that text is blank.
 */
export function titleOfPrompt(text: string, attachments: { name: string }[]): string {
  const line = text
    .split(/\r\n|\r|\n/)
    .map((part) => part.trim())
    .find((part) => part !== "");
  return line ?? attachments.map((attachment) => attachment.name).join(", ");
}
