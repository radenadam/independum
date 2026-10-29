import { readFile, writeFile } from "node:fs/promises";
import { Type } from "@earendil-works/pi-ai";
import {
  defineTool,
  type ToolDefinition,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { structuredPatch } from "diff";
import type { EditDetails } from "../api-types.ts";
import { defineText, type ModelText, type ModelTexts } from "../model-texts.ts";
import { type FileFingerprint, fingerprintOf, versionOf } from "./file-fingerprint.ts";
import { decodeText, encodeText, findFile, pathParameterOf, splitLines } from "./text-file.ts";

/**
 * A text as Edit matches it: its lines joined by line feeds, with where each line starts and how
 * many line breaks of Windows come before it, so a place in the view maps back to the file.
 */
interface TextView {
  view: string;
  lineStarts: number[];
  windowsBreaksBefore: number[];
  lineBreak: "\r\n" | "\n";
}

const group = "Edit";
const pathSlot = { meaning: "The file as the model gave it.", example: "src/app.ts" };
const lineSlot = { meaning: "The number of a line.", example: "51" };
const linesSlot = { meaning: "Lines of the file.", example: "lines 40 to 52" };

/** The texts of the Edit tool that the model reads, which the user can edit. */
const editTexts = {
  description: defineText({
    id: "edit.description",
    group,
    section: "description",
    label: "Every request",
    builtIn:
      "Replaces an exact text in a file with another. `old_string` must occur once, unless `replace_all` is set, or `line` and `column` choose one place.",
    slots: {},
  }),
  path: defineText({
    id: "edit.parameters.path",
    group,
    section: "parameter",
    label: "path",
    builtIn: "The file, as a path in the project folder or an absolute path.",
    slots: {},
  }),
  oldString: defineText({
    id: "edit.parameters.old_string",
    group,
    section: "parameter",
    label: "old_string",
    builtIn: "The text to replace, exactly as it is in the file.",
    slots: {},
  }),
  newString: defineText({
    id: "edit.parameters.new_string",
    group,
    section: "parameter",
    label: "new_string",
    builtIn: "The text to put in its place.",
    slots: {},
  }),
  replaceAll: defineText({
    id: "edit.parameters.replace_all",
    group,
    section: "parameter",
    label: "replace_all",
    builtIn: "Replaces every place where `old_string` occurs. Defaults to false.",
    slots: {},
  }),
  line: defineText({
    id: "edit.parameters.line",
    group,
    section: "parameter",
    label: "line",
    builtIn: "The line where `old_string` starts, when it occurs more than once.",
    slots: {},
  }),
  column: defineText({
    id: "edit.parameters.column",
    group,
    section: "parameter",
    label: "column",
    builtIn:
      "The column on that line where `old_string` starts, when it occurs more than once there.",
    slots: {},
  }),
  replaced: defineText({
    id: "edit.replaced",
    group,
    section: "result",
    label: "When the edit is done",
    builtIn: "Replaced {before} of {path} with {after}.",
    slots: {
      before: { meaning: "The lines that old_string covered.", example: "lines 40 to 52" },
      path: pathSlot,
      after: { meaning: "The lines that new_string covers now.", example: "lines 40 to 55" },
    },
  }),
  removed: defineText({
    id: "edit.removed",
    group,
    section: "result",
    label: "When the edit is done and new_string is empty",
    builtIn: "Removed the text at {before} of {path}.",
    slots: {
      before: { meaning: "The lines that old_string covered.", example: "line 51" },
      path: pathSlot,
    },
  }),
  replacedAll: defineText({
    id: "edit.replacedAll",
    group,
    section: "result",
    label: "When replace_all is done",
    builtIn: "Replaced {count} places in {path}, at {lines}.",
    slots: {
      count: { meaning: "How many places were replaced.", example: "4" },
      path: pathSlot,
      lines: { meaning: "Where each replacement starts now.", example: "lines 3, 18, 40, and 77" },
    },
  }),
  notFound: defineText({
    id: "edit.notFound",
    group,
    section: "result",
    label: "When old_string is not in the file",
    builtIn: "old_string is not in {path}.",
    slots: { path: pathSlot },
  }),
  nearMiss: defineText({
    id: "edit.nearMiss",
    group,
    section: "result",
    label: "After it, when old_string differs from text in the file only in the ways below",
    builtIn: "It matches {lines} except for {differences}.",
    slots: {
      lines: linesSlot,
      differences: {
        meaning: "The differences below that apply, one after another.",
        example: "the space at the end of line 51, which the file has and old_string does not",
      },
    },
  }),
  fileHasTrailing: defineText({
    id: "edit.fileHasTrailing",
    group,
    section: "result",
    label:
      "A difference: the file has spaces or tabs at the end of a line, and old_string does not",
    builtIn:
      "the {whitespace} at the end of line {line}, which the file has and old_string does not",
    slots: {
      whitespace: { meaning: "What is at the end of the line.", example: "space" },
      line: lineSlot,
    },
  }),
  oldHasTrailing: defineText({
    id: "edit.oldHasTrailing",
    group,
    section: "result",
    label:
      "A difference: old_string has spaces or tabs at the end of a line, and the file does not",
    builtIn:
      "the {whitespace} at the end of line {line} in old_string, which the file does not have",
    slots: {
      whitespace: { meaning: "What old_string has at the end of the line.", example: "2 spaces" },
      line: lineSlot,
    },
  }),
  endDiffers: defineText({
    id: "edit.endDiffers",
    group,
    section: "result",
    label: "A difference: both have spaces or tabs at the end of a line, but not the same",
    builtIn: "the end of line {line}, where the file has {file} and old_string has {old}",
    slots: {
      line: lineSlot,
      file: { meaning: "What the file has there.", example: "a tab" },
      old: { meaning: "What old_string has there.", example: "2 spaces" },
    },
  }),
  startDiffers: defineText({
    id: "edit.startDiffers",
    group,
    section: "result",
    label: "A difference: spaces or tabs at the start of a line",
    builtIn: "the start of line {line}, where the file has {file} and old_string has {old}",
    slots: {
      line: lineSlot,
      file: { meaning: "What the file has there.", example: "a tab" },
      old: { meaning: "What old_string has there.", example: "4 spaces" },
    },
  }),
  characterDiffers: defineText({
    id: "edit.characterDiffers",
    group,
    section: "result",
    label: "A difference: a quote, a dash, or a space that looks alike but is another character",
    builtIn:
      "the character at line {line}, column {column}, where the file has {file} and old_string has {old}",
    slots: {
      line: lineSlot,
      column: { meaning: "The column of the character in the file.", example: "3" },
      file: { meaning: "The character in the file.", example: "`\u2019`" },
      old: { meaning: "The character in old_string.", example: "`'`" },
    },
  }),
  readNumbers: defineText({
    id: "edit.readNumbers",
    group,
    section: "result",
    label: "A difference: each line of old_string starts with a line number and a tab",
    builtIn:
      "the line number and tab at the start of each line of old_string, which Read adds and the file does not hold",
    slots: {},
  }),
  moreDifferences: defineText({
    id: "edit.moreDifferences",
    group,
    section: "result",
    label: "After five differences, when there are more",
    builtIn: "{count} more",
    slots: { count: { meaning: "How many more differences there are.", example: "3" } },
  }),
  closest: defineText({
    id: "edit.closest",
    group,
    section: "result",
    label: "After it, when no text differs only in those ways but some text comes close",
    builtIn: "The closest text is at {lines}:\n{text}",
    slots: {
      lines: linesSlot,
      text: {
        meaning: "Those lines, each after its number and a tab, as Read shows them.",
        example: "40\tconst total = items.length;",
      },
    },
  }),
  occurrences: defineText({
    id: "edit.occurrences",
    group,
    section: "result",
    label: "When old_string occurs more than once, and neither replace_all nor line is set",
    builtIn: "old_string occurs {count} times in {path}, at {lines}, and replace_all is not set.",
    slots: {
      count: { meaning: "How many times it occurs.", example: "30" },
      path: pathSlot,
      lines: { meaning: "The lines where it starts.", example: "lines 3, 9, 17, and 51" },
    },
  }),
  occurrencesOnLine: defineText({
    id: "edit.occurrencesOnLine",
    group,
    section: "result",
    label: "When old_string occurs more than once on one line, and column is not set",
    builtIn: "old_string occurs {count} times on line {line} of {path}, at columns {columns}.",
    slots: {
      count: { meaning: "How many times it occurs on the line.", example: "4" },
      line: lineSlot,
      path: pathSlot,
      columns: { meaning: "The columns where it starts.", example: "1, 24, 47, and 70" },
    },
  }),
  notAtLine: defineText({
    id: "edit.notAtLine",
    group,
    section: "result",
    label: "When old_string does not start at the line given",
    builtIn: "old_string does not start at line {line} of {path}. It starts at {lines}.",
    slots: {
      line: lineSlot,
      path: pathSlot,
      lines: { meaning: "The lines where it starts.", example: "lines 3, 9, and 51" },
    },
  }),
  notAtColumn: defineText({
    id: "edit.notAtColumn",
    group,
    section: "result",
    label: "When old_string does not start at the column given",
    builtIn:
      "old_string does not start at line {line}, column {column} of {path}. On that line it starts at columns {columns}.",
    slots: {
      line: lineSlot,
      column: { meaning: "The column that the model gave.", example: "48" },
      path: pathSlot,
      columns: { meaning: "The columns where it starts.", example: "1, 24, 47, and 70" },
    },
  }),
  columnNeedsLine: defineText({
    id: "edit.columnNeedsLine",
    group,
    section: "result",
    label: "When column is set without line",
    builtIn: "column needs line.",
    slots: {},
  }),
  replaceAllWithLine: defineText({
    id: "edit.replaceAllWithLine",
    group,
    section: "result",
    label: "When replace_all and line are both set",
    builtIn: "replace_all and line cannot be used together.",
    slots: {},
  }),
  same: defineText({
    id: "edit.same",
    group,
    section: "result",
    label: "When old_string and new_string are the same",
    builtIn: "old_string and new_string are the same.",
    slots: {},
  }),
  empty: defineText({
    id: "edit.empty",
    group,
    section: "result",
    label: "When old_string is empty",
    builtIn: "old_string is empty.",
    slots: {},
  }),
  notUtf8: defineText({
    id: "edit.notUtf8",
    group,
    section: "result",
    label: "When the file is not valid UTF-8",
    builtIn: "{path} is not valid UTF-8, so Edit cannot change it without losing bytes.",
    slots: { path: pathSlot },
  }),
};

/** The texts of the Edit tool, in the order that the Agent place shows them. */
export const editTextList: ModelText[] = Object.values(editTexts);

const numberFormat = new Intl.NumberFormat("en-US");
const placeCap = 20;
const differenceCap = 5;
const closestShown = 40;
// Quotes, dashes, and spaces that look like their ASCII forms, each with the form it looks like.
const lookalikes = new Map([
  ...[..."\u2018\u2019\u201a\u201b"].map((character) => [character, "'"] as const),
  ...[..."\u201c\u201d\u201e\u201f"].map((character) => [character, '"'] as const),
  ...[..."\u2010\u2011\u2012\u2013\u2014\u2015\u2212"].map(
    (character) => [character, "-"] as const,
  ),
  ...[..."\u00a0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000"].map(
    (character) => [character, " "] as const,
  ),
]);
const readNumber = /^\d+\t/;

/**
 * Creates the Edit tool, which replaces an exact text in a file and keeps the encoding and the line
 * breaks of the file.
 */
export function createEditTool(texts: ModelTexts): ToolDefinition {
  return defineTool({
    name: "Edit",
    label: "Edit",
    get description() {
      return texts.get(editTexts.description);
    },
    get parameters() {
      // biome-ignore-start lint/style/useNamingConvention: Models know these names from other editing tools.
      return Type.Object({
        path: pathParameterOf(texts.get(editTexts.path)),
        old_string: Type.String({ description: texts.get(editTexts.oldString) }),
        new_string: Type.String({ description: texts.get(editTexts.newString) }),
        replace_all: Type.Optional(Type.Boolean({ description: texts.get(editTexts.replaceAll) })),
        line: Type.Optional(Type.Integer({ minimum: 1, description: texts.get(editTexts.line) })),
        column: Type.Optional(
          Type.Integer({ minimum: 1, description: texts.get(editTexts.column) }),
        ),
      });
      // biome-ignore-end lint/style/useNamingConvention: Models know these names from other editing tools.
    },
    async execute(_toolCallId, input, _signal, _onUpdate, context) {
      const { path, line, column } = input;
      const wanted = input.old_string.replaceAll("\r\n", "\n");
      const replacement = input.new_string.replaceAll("\r\n", "\n");
      const isReplaceAll = input.replace_all === true;
      checkInput(wanted, replacement, isReplaceAll, line, column, texts);
      const { file } = findFile(path, context.cwd, texts);
      return withFileMutationQueue(file, async () => {
        const bytes = await readFile(file);
        const decoded = decodeText(bytes, path, texts);
        if (!decoded.isUtf8) {
          throw new Error(texts.fill(editTexts.notUtf8, { path }));
        }
        const text = viewOf(decoded.text);
        const lines = splitLines(decoded.text);
        const starts = occurrencesOf(text.view, wanted);
        if (starts.length === 0) {
          throw new Error(explainMiss(lines, wanted, path, texts));
        }
        const chosen = isReplaceAll
          ? apart(starts, wanted.length)
          : [choosePlace(text, starts, line, column, path, texts)];
        const { key, change } = versionOf(context, file, bytes, lines, path, texts);
        const edited = replaceAt(decoded.text, text, chosen, wanted.length, replacement);
        const editedBytes = encodeText(edited, decoded);
        await writeFile(file, editedBytes);
        const editedLines = splitLines(edited);
        const fingerprint = fingerprintOf(key, editedBytes, editedLines, undefined);
        const result = describeResult(text, chosen, wanted, replacement, path, texts);
        const details: EditDetails & { fingerprint: FileFingerprint } = {
          ...diffOf(text.view, viewOf(edited).view),
          fingerprint,
        };
        return {
          content: [{ type: "text", text: change === undefined ? result : `${result}\n${change}` }],
          details,
        };
      });
    },
  });
}

function checkInput(
  wanted: string,
  replacement: string,
  isReplaceAll: boolean,
  line: number | undefined,
  column: number | undefined,
  texts: ModelTexts,
): void {
  if (wanted === "") {
    throw new Error(texts.get(editTexts.empty));
  }
  if (wanted === replacement) {
    throw new Error(texts.get(editTexts.same));
  }
  if (column !== undefined && line === undefined) {
    throw new Error(texts.get(editTexts.columnNeedsLine));
  }
  if (isReplaceAll && line !== undefined) {
    throw new Error(texts.get(editTexts.replaceAllWithLine));
  }
}

// The view keeps every character of the file except the carriage return of each line break of
// Windows, which Read does not show either.
function viewOf(text: string): TextView {
  const parts = text.split(/(\r?\n)/);
  let view = "";
  const lineStarts: number[] = [];
  const windowsBreaksBefore: number[] = [];
  let windowsBreaks = 0;
  let unixBreaks = 0;
  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index] ?? "";
    const lineBreak = parts[index + 1];
    if (index > 0 && line === "" && lineBreak === undefined) {
      break;
    }
    lineStarts.push(view.length);
    windowsBreaksBefore.push(windowsBreaks);
    view += line;
    if (lineBreak === "\r\n") {
      windowsBreaks += 1;
    } else if (lineBreak !== undefined) {
      unixBreaks += 1;
    }
    view += lineBreak === undefined ? "" : "\n";
  }
  return {
    view,
    lineStarts,
    windowsBreaksBefore,
    lineBreak: windowsBreaks > unixBreaks ? "\r\n" : "\n",
  };
}

function lineIndexOf({ lineStarts }: TextView, offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function positionOf(text: TextView, offset: number): { line: number; column: number } {
  const index = lineIndexOf(text, offset);
  return { line: index + 1, column: offset - (text.lineStarts[index] ?? 0) + 1 };
}

function fileOffsetOf(text: TextView, offset: number): number {
  return offset + (text.windowsBreaksBefore[lineIndexOf(text, offset)] ?? 0);
}

function occurrencesOf(view: string, wanted: string): number[] {
  const starts: number[] = [];
  let start = view.indexOf(wanted);
  while (start !== -1) {
    starts.push(start);
    start = view.indexOf(wanted, start + 1);
  }
  return starts;
}

// Replacing every place takes them from the start of the file, each after the end of the one before.
function apart(starts: number[], length: number): number[] {
  const chosen: number[] = [];
  for (const start of starts) {
    if (start >= (chosen.at(-1) ?? Number.NEGATIVE_INFINITY) + length) {
      chosen.push(start);
    }
  }
  return chosen;
}

function choosePlace(
  text: TextView,
  starts: number[],
  line: number | undefined,
  column: number | undefined,
  path: string,
  texts: ModelTexts,
): number {
  const positions = starts.map((start) => ({ start, ...positionOf(text, start) }));
  const lineNumbers = [...new Set(positions.map((each) => each.line))];
  if (line === undefined) {
    if (positions.length === 1) {
      return starts[0] ?? 0;
    }
    if (lineNumbers.length === 1) {
      throw new Error(describeOnLine(positions, path, texts));
    }
    throw new Error(
      texts.fill(editTexts.occurrences, {
        count: numberFormat.format(positions.length),
        path,
        lines: describeNumbers(lineNumbers, "line", "lines"),
      }),
    );
  }
  const onLine = positions.filter((each) => each.line === line);
  if (onLine.length === 0) {
    throw new Error(
      texts.fill(editTexts.notAtLine, {
        line: numberFormat.format(line),
        path,
        lines: describeNumbers(lineNumbers, "line", "lines"),
      }),
    );
  }
  if (column === undefined) {
    if (onLine.length > 1) {
      throw new Error(describeOnLine(onLine, path, texts));
    }
    return onLine[0]?.start ?? 0;
  }
  const atColumn = onLine.find((each) => each.column === column);
  if (atColumn === undefined) {
    throw new Error(
      texts.fill(editTexts.notAtColumn, {
        line: numberFormat.format(line),
        column: numberFormat.format(column),
        path,
        columns: describeNumbers(
          onLine.map((each) => each.column),
          "",
          "",
        ),
      }),
    );
  }
  return atColumn.start;
}

function describeOnLine(
  positions: { line: number; column: number }[],
  path: string,
  texts: ModelTexts,
): string {
  return texts.fill(editTexts.occurrencesOnLine, {
    count: numberFormat.format(positions.length),
    line: numberFormat.format(positions[0]?.line ?? 1),
    path,
    columns: describeNumbers(
      positions.map((each) => each.column),
      "",
      "",
    ),
  });
}

// Each replacement goes where its text was in the file, so every other byte stays as it was, and the
// line breaks in the new text take the line break that the file uses most.
function replaceAt(
  original: string,
  text: TextView,
  starts: number[],
  length: number,
  replacement: string,
): string {
  const lineBreak = replacement.replaceAll("\n", text.lineBreak);
  let edited = "";
  let from = 0;
  for (const start of starts) {
    edited += original.slice(from, fileOffsetOf(text, start)) + lineBreak;
    from = fileOffsetOf(text, start + length);
  }
  return edited + original.slice(from);
}

function describeResult(
  text: TextView,
  starts: number[],
  wanted: string,
  replacement: string,
  path: string,
  texts: ModelTexts,
): string {
  const shift = replacement.length - wanted.length;
  const startLines = starts.map((start, index) => {
    const before = text.view.slice(0, start);
    const earlier = (replacement.split("\n").length - wanted.split("\n").length) * index;
    return before.split("\n").length + earlier;
  });
  if (starts.length > 1) {
    return texts.fill(editTexts.replacedAll, {
      count: numberFormat.format(starts.length),
      path,
      lines: describeNumbers([...new Set(startLines)], "line", "lines"),
    });
  }
  const start = starts[0] ?? 0;
  const firstLine = positionOf(text, start).line;
  const before = describeRange(firstLine, positionOf(text, start + wanted.length - 1).line);
  if (replacement === "") {
    return texts.fill(editTexts.removed, { before, path });
  }
  const lastLine = firstLine + (replacement.slice(0, -1).match(/\n/g)?.length ?? 0);
  return shift === 0 && before === describeRange(firstLine, lastLine)
    ? texts.fill(editTexts.replaced, { before, path, after: before })
    : texts.fill(editTexts.replaced, { before, path, after: describeRange(firstLine, lastLine) });
}

function describeRange(first: number, last: number): string {
  return first === last
    ? `line ${numberFormat.format(first)}`
    : `lines ${numberFormat.format(first)} to ${numberFormat.format(last)}`;
}

function describeNumbers(numbers: number[], one: string, many: string): string {
  const named = numbers.slice(0, placeCap).map((number) => numberFormat.format(number));
  const word = numbers.length === 1 ? one : many;
  const prefix = word === "" ? "" : `${word} `;
  const rest = numbers.length - named.length;
  if (rest > 0) {
    return `${prefix}${named.join(", ")}, and ${numberFormat.format(rest)} more`;
  }
  if (named.length <= 2) {
    return `${prefix}${named.join(" and ")}`;
  }
  return `${prefix}${named.slice(0, -1).join(", ")}, and ${named.at(-1)}`;
}

function diffOf(before: string, after: string): EditDetails {
  const { hunks } = structuredPatch("before", "after", before, after, undefined, undefined, {
    context: 3,
  });
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      added += line.startsWith("+") ? 1 : 0;
      removed += line.startsWith("-") ? 1 : 0;
    }
  }
  return {
    hunks: hunks.map(({ oldStart, newStart, lines }) => ({ oldStart, newStart, lines })),
    added,
    removed,
  };
}

// A missed old_string is compared with the file once more, line by line, without the differences
// that are hard to see. When it matches that way, the result names each difference. Otherwise it
// shows the text that comes closest.
function explainMiss(lines: string[], wanted: string, path: string, texts: ModelTexts): string {
  const missing = texts.fill(editTexts.notFound, { path });
  const wantedLines = wanted.split("\n");
  if (wantedLines.length > 1 && wantedLines.at(-1) === "") {
    wantedLines.pop();
  }
  const explained = nearMissOf(lines, wantedLines, texts) ?? closestOf(lines, wantedLines, texts);
  return explained === undefined ? missing : `${missing} ${explained}`;
}

function nearMissOf(lines: string[], wantedLines: string[], texts: ModelTexts): string | undefined {
  const isNumbered =
    wantedLines.some((line) => line !== "") &&
    wantedLines.every((line) => line === "" || readNumber.test(line));
  const ownLines = isNumbered
    ? wantedLines.map((line) => line.replace(readNumber, ""))
    : wantedLines;
  const plainFile = lines.map(plainOf).join("\n");
  const plainWanted = ownLines.map(plainOf).join("\n");
  const offset = plainWanted.trim() === "" ? -1 : plainFile.indexOf(plainWanted);
  if (offset === -1) {
    return undefined;
  }
  const first = plainFile.slice(0, offset).split("\n").length - 1;
  const differences = isNumbered ? [texts.get(editTexts.readNumbers)] : [];
  for (const [index, own] of ownLines.entries()) {
    const fileLine = lines[first + index] ?? "";
    differences.push(
      ...differencesOf(fileLine, own, first + index + 1, index, ownLines.length, texts),
    );
  }
  if (differences.length === 0) {
    return undefined;
  }
  const named = differences.slice(0, differenceCap);
  if (differences.length > differenceCap) {
    named.push(
      texts.fill(editTexts.moreDifferences, {
        count: numberFormat.format(differences.length - differenceCap),
      }),
    );
  }
  return texts.fill(editTexts.nearMiss, {
    lines: describeRange(first + 1, first + ownLines.length),
    differences: joinAll(named),
  });
}

// A line without spaces and tabs at its ends, and with lookalike characters in their ASCII forms.
function plainOf(line: string): string {
  return [...line.trim()].map((character) => lookalikes.get(character) ?? character).join("");
}

// The first line of old_string can start in the middle of its line, and the last can end in the
// middle of its own, so only the ends that old_string reaches are compared. A first line that holds
// all of its line is compared at its start too.
function differencesOf(
  fileLine: string,
  own: string,
  line: number,
  index: number,
  count: number,
  texts: ModelTexts,
): string[] {
  const differences: string[] = [];
  const lineNumber = numberFormat.format(line);
  const fileStart = leadingOf(fileLine);
  const ownStart = leadingOf(own);
  const isWholeLine = plainOf(fileLine) === plainOf(own);
  if ((index > 0 || isWholeLine) && fileStart !== ownStart) {
    differences.push(
      texts.fill(editTexts.startDiffers, {
        line: lineNumber,
        file: describeWhitespace(fileStart),
        old: describeWhitespace(ownStart),
      }),
    );
  }
  const fileEnd = trailingOf(fileLine);
  const ownEnd = trailingOf(own);
  if (fileEnd !== ownEnd && (index < count - 1 || ownEnd !== "")) {
    differences.push(describeEnds(fileEnd, ownEnd, lineNumber, texts));
  }
  // Lookalike characters all sit in the basic plane, so the plain forms keep every index in place.
  const fileCore = fileLine.trim();
  const ownCore = own.trim();
  const at = plainOf(fileCore).indexOf(plainOf(ownCore));
  for (let position = 0; at !== -1 && position < ownCore.length; position += 1) {
    const fileCharacter = fileCore[at + position];
    const character = ownCore[position];
    if (fileCharacter !== undefined && character !== undefined && fileCharacter !== character) {
      differences.push(
        texts.fill(editTexts.characterDiffers, {
          line: lineNumber,
          column: numberFormat.format(leadingOf(fileLine).length + at + position + 1),
          file: `\`${fileCharacter}\``,
          old: `\`${character}\``,
        }),
      );
      break;
    }
  }
  return differences;
}

function describeEnds(fileEnd: string, ownEnd: string, line: string, texts: ModelTexts): string {
  if (ownEnd === "") {
    return texts.fill(editTexts.fileHasTrailing, {
      whitespace: describeWhitespace(fileEnd, false),
      line,
    });
  }
  if (fileEnd === "") {
    return texts.fill(editTexts.oldHasTrailing, {
      whitespace: describeWhitespace(ownEnd, false),
      line,
    });
  }
  return texts.fill(editTexts.endDiffers, {
    line,
    file: describeWhitespace(fileEnd),
    old: describeWhitespace(ownEnd),
  });
}

function leadingOf(line: string): string {
  return line.slice(0, line.length - line.trimStart().length);
}

function trailingOf(line: string): string {
  return line.slice(line.trimEnd().length);
}

// Spaces and tabs as words, such as "a tab and 2 spaces", or without the article for one kind.
function describeWhitespace(whitespace: string, hasArticle = true): string {
  if (whitespace === "") {
    return "nothing";
  }
  const tabs = [...whitespace].filter((character) => character === "\t").length;
  const spaces = [...whitespace].filter((character) => character === " ").length;
  const others = whitespace.length - tabs - spaces;
  const parts = [
    [tabs, "tab", "tabs"],
    [spaces, "space", "spaces"],
    [others, "special space", "special spaces"],
  ] as const;
  const named = parts
    .filter(([amount]) => amount > 0)
    .map(([amount, one, many]) =>
      amount === 1 ? (hasArticle ? `a ${one}` : one) : `${amount} ${many}`,
    );
  return named.join(" and ");
}

function joinAll(parts: string[]): string {
  if (parts.length <= 2) {
    return parts.join(", and ");
  }
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

// The closest text has the most words in common with old_string, line for line.
function closestOf(lines: string[], wantedLines: string[], texts: ModelTexts): string | undefined {
  const fileWords = lines.map(wordsOf);
  const wantedWords = wantedLines.map(wordsOf);
  let best = { score: 0, first: -1 };
  for (let first = 0; first + wantedLines.length <= lines.length; first += 1) {
    let total = 0;
    for (const [index, words] of wantedWords.entries()) {
      total += overlapOf(fileWords[first + index] ?? new Set(), words);
    }
    const score = total / wantedLines.length;
    if (score > best.score) {
      best = { score, first };
    }
  }
  if (best.score < 0.5) {
    return undefined;
  }
  const shown = Math.min(wantedLines.length, closestShown);
  const numbered = lines
    .slice(best.first, best.first + shown)
    .map((line, index) => `${best.first + index + 1}\t${line}`)
    .join("\n");
  return texts.fill(editTexts.closest, {
    lines: describeRange(best.first + 1, best.first + shown),
    text: numbered,
  });
}

function wordsOf(line: string): Set<string> {
  return new Set(
    plainOf(line)
      .split(/\W+/)
      .filter((word) => word !== ""),
  );
}

function overlapOf(first: Set<string>, second: Set<string>): number {
  if (first.size === 0 && second.size === 0) {
    return 1;
  }
  let shared = 0;
  for (const word of second) {
    shared += first.has(word) ? 1 : 0;
  }
  return shared / (first.size + second.size - shared);
}
