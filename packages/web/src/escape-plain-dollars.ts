// A fenced block of code opens with three or more backticks or tildes, and closes with the same.
const fencePattern = /^ {0,3}(`{3,}|~{3,})/;
// A code span is a run of backticks, its code, and a run of the same length.
const codeSpanPattern = /(`+)[\s\S]*?[^`]\1(?!`)/g;

/**
 * Returns Markdown in which each dollar sign that cannot start or end inline math is escaped, so a
 * price such as $5 stays text. The rule follows Pandoc: math opens at a dollar sign with no space
 * after it, and closes at the next dollar sign with no space before it and no digit after it.
 */
export function escapePlainDollars(markdown: string): string {
  let fence: string | undefined;
  const lines = [];
  for (const line of markdown.split("\n")) {
    const marker = fencePattern.exec(line)?.[1];
    if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
        fence = undefined;
      }
      lines.push(line);
    } else if (marker !== undefined) {
      fence = marker;
      lines.push(line);
    } else {
      lines.push(escapeLine(line));
    }
  }
  return lines.join("\n");
}

// Code spans keep their dollar signs, so only the text around them is escaped.
function escapeLine(line: string): string {
  let escaped = "";
  let end = 0;
  for (const span of line.matchAll(codeSpanPattern)) {
    escaped += escapeText(line.slice(end, span.index)) + span[0];
    end = span.index + span[0].length;
  }
  return escaped + escapeText(line.slice(end));
}

function escapeText(text: string): string {
  // A dollar sign counts when it stands alone, so an escaped one and a pair for display math do not.
  const dollars: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
    } else if (text[index] === "$" && text[index + 1] === "$") {
      index += 1;
    } else if (text[index] === "$") {
      dollars.push(index);
    }
  }
  const plain = new Set<number>();
  let at = 0;
  while (at < dollars.length) {
    const open = dollars[at] ?? 0;
    const close = dollars[at + 1];
    if (canOpen(text, open) && close !== undefined && canClose(text, close)) {
      at += 2;
    } else {
      plain.add(open);
      at += 1;
    }
  }
  let escaped = "";
  for (let index = 0; index < text.length; index += 1) {
    escaped += plain.has(index) ? "\\$" : text.charAt(index);
  }
  return escaped;
}

function canOpen(text: string, index: number): boolean {
  const after = text[index + 1];
  return after !== undefined && !/\s/.test(after);
}

function canClose(text: string, index: number): boolean {
  const before = text[index - 1];
  const after = text[index + 1];
  return before !== undefined && !/\s/.test(before) && (after === undefined || !/\d/.test(after));
}
