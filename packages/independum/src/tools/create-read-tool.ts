import { readdirSync, type Stats, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import {
  defineTool,
  detectSupportedImageMimeTypeFromFile,
  formatDimensionNote,
  resizeImage,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { OutputLimits, ReadDetails } from "../api-types.ts";
import { defineText, type ModelText, type ModelTexts } from "../model-texts.ts";

/** What the Read tool needs: the output limits that it shares with Shell, and the model texts. */
interface ReadToolOptions {
  getLimits: () => OutputLimits;
  texts: ModelTexts;
}

/** Where a read starts and what ends it before the end of the file, as the model asked. */
interface ReadWindow {
  offset: number;
  limit: number | undefined;
  column: number;
  length: number | undefined;
}

/** The lines that a read returns, and the note that says what it leaves out. */
interface ReadLines {
  text: string;
  firstLine: number;
  lastLine: number;
}

const group = "Read";
const pathSlot = { meaning: "The file as the model gave it.", example: "src/app.ts" };
const lineSlot = { meaning: "The number of a line.", example: "201" };
const firstSlot = { meaning: "The first that is not shown.", example: "813" };
const lastSlot = { meaning: "The last that is not shown.", example: "5,400" };

/** The texts of the Read tool that the model reads, which the user can edit. */
const readTexts = {
  description: defineText({
    id: "read.description",
    group,
    section: "description",
    label: "Every request",
    builtIn:
      "Reads a file and returns its lines, each after its line number and a tab. Reads PNG, JPEG, GIF, and WebP images as images.",
    slots: {},
  }),
  path: defineText({
    id: "read.parameters.path",
    group,
    section: "parameter",
    label: "path",
    builtIn: "The file, as a path in the project folder or an absolute path.",
    slots: {},
  }),
  offset: defineText({
    id: "read.parameters.offset",
    group,
    section: "parameter",
    label: "offset",
    builtIn: "The line to start from, counting from 1. Defaults to 1.",
    slots: {},
  }),
  limit: defineText({
    id: "read.parameters.limit",
    group,
    section: "parameter",
    label: "limit",
    builtIn: "How many lines to read. Without it, reads to the end of the file.",
    slots: {},
  }),
  column: defineText({
    id: "read.parameters.column",
    group,
    section: "parameter",
    label: "column",
    builtIn: "The column of the first line to start from, counting from 1. Defaults to 1.",
    slots: {},
  }),
  length: defineText({
    id: "read.parameters.length",
    group,
    section: "parameter",
    label: "length",
    builtIn: "How many characters to read. Without it, every line is read whole.",
    slots: {},
  }),
  note: defineText({
    id: "read.note",
    group,
    section: "result",
    label: "Around the note at the end of a read that stops before the end of the file",
    builtIn: "[{note}]",
    slots: {
      note: {
        meaning: "The sentences below that apply, one after another.",
        example: "Lines 813 to 5,400 are not shown. The read stops at the output limit of 50 KB.",
      },
    },
  }),
  linesNotShown: defineText({
    id: "read.linesNotShown",
    group,
    section: "result",
    label: "When lines after the read are not shown",
    builtIn: "Lines {first} to {last} are not shown.",
    slots: { first: firstSlot, last: lastSlot },
  }),
  lineNotShown: defineText({
    id: "read.lineNotShown",
    group,
    section: "result",
    label: "When the last line of the file alone is not shown",
    builtIn: "Line {line} is not shown.",
    slots: { line: lineSlot },
  }),
  columnsNotShown: defineText({
    id: "read.columnsNotShown",
    group,
    section: "result",
    label: "When the read stops inside the last line of the file",
    builtIn: "Columns {first} to {last} of line {line} are not shown.",
    slots: { first: firstSlot, last: lastSlot, line: lineSlot },
  }),
  columnsAndLinesNotShown: defineText({
    id: "read.columnsAndLinesNotShown",
    group,
    section: "result",
    label: "When the read stops inside a line, and lines after it are not shown",
    builtIn: "Columns {first} to {last} of line {line} and lines {from} to {to} are not shown.",
    slots: {
      first: firstSlot,
      last: lastSlot,
      line: lineSlot,
      from: { meaning: "The first line after it.", example: "13" },
      to: { meaning: "The last line of the file.", example: "812" },
    },
  }),
  columnsAndLineNotShown: defineText({
    id: "read.columnsAndLineNotShown",
    group,
    section: "result",
    label: "When the read stops inside a line, and the last line of the file is not shown",
    builtIn: "Columns {first} to {last} of line {line} and line {next} are not shown.",
    slots: {
      first: firstSlot,
      last: lastSlot,
      line: lineSlot,
      next: { meaning: "The last line of the file.", example: "13" },
    },
  }),
  outputLimit: defineText({
    id: "read.outputLimit",
    group,
    section: "result",
    label: "After what is not shown, when the output limit stops the read",
    builtIn: "The read stops at the output limit of {limit}.",
    slots: { limit: { meaning: "The limit that the read reached.", example: "50 KB" } },
  }),
  longLine: defineText({
    id: "read.longLine",
    group,
    section: "result",
    label: "After the output limit, when the next line alone is longer than the limit",
    builtIn: "Line {line} alone has {characters} characters.",
    slots: {
      line: lineSlot,
      characters: { meaning: "How many characters the line has.", example: "102,400" },
    },
  }),
  notUtf8: defineText({
    id: "read.notUtf8",
    group,
    section: "result",
    label: "At the end of the lines of a file that is not valid UTF-8",
    builtIn: "[The file is not valid UTF-8, so bytes that are not text show as \uFFFD.]",
    slots: {},
  }),
  empty: defineText({
    id: "read.empty",
    group,
    section: "result",
    label: "When the file is empty",
    builtIn: "{path} is empty.",
    slots: { path: pathSlot },
  }),
  pastEnd: defineText({
    id: "read.pastEnd",
    group,
    section: "result",
    label: "When offset is past the end of the file",
    builtIn: "{path} ends at line {last}, so line {line} is past its end.",
    slots: {
      path: pathSlot,
      last: { meaning: "The last line of the file.", example: "812" },
      line: { meaning: "The offset that the model gave.", example: "900" },
    },
  }),
  columnPastEnd: defineText({
    id: "read.columnPastEnd",
    group,
    section: "result",
    label: "When column is past the end of its line",
    builtIn: "Line {line} of {path} ends at column {last}, so column {column} is past its end.",
    slots: {
      line: lineSlot,
      path: pathSlot,
      last: { meaning: "The last column of the line.", example: "80" },
      column: { meaning: "The column that the model gave.", example: "120" },
    },
  }),
  lineEmpty: defineText({
    id: "read.lineEmpty",
    group,
    section: "result",
    label: "When column is past the start of an empty line",
    builtIn: "Line {line} of {path} is empty, so column {column} is past its end.",
    slots: {
      line: lineSlot,
      path: pathSlot,
      column: { meaning: "The column that the model gave.", example: "2" },
    },
  }),
  folder: defineText({
    id: "read.folder",
    group,
    section: "result",
    label: "When the path is a folder",
    builtIn: "{path} is a folder, not a file.",
    slots: { path: pathSlot },
  }),
  missing: defineText({
    id: "read.missing",
    group,
    section: "result",
    label: "When no file is at the path",
    builtIn: "No file at {path}.",
    slots: { path: pathSlot },
  }),
  similar: defineText({
    id: "read.similar",
    group,
    section: "result",
    label: "After a missing file, when its folder holds names like it",
    builtIn: "Similar names: {names}.",
    slots: {
      names: { meaning: "Up to three paths in the same folder.", example: "src/app.ts, src/apps" },
    },
  }),
  binary: defineText({
    id: "read.binary",
    group,
    section: "result",
    label: "When the file is binary and not an image that Read takes",
    builtIn: "{path} is a binary file of {size}, so it has no text to show.",
    slots: { path: pathSlot, size: { meaning: "The size of the file.", example: "2.4 MB" } },
  }),
  image: defineText({
    id: "read.image",
    group,
    section: "result",
    label: "Before an image",
    builtIn: "{path} is an image of {width} by {height} pixels.",
    slots: {
      path: pathSlot,
      width: { meaning: "The width of the image in the file.", example: "1,400" },
      height: { meaning: "The height of the image in the file.", example: "900" },
    },
  }),
  imageNotTaken: defineText({
    id: "read.imageNotTaken",
    group,
    section: "result",
    label: "When the file is an image and the model of the chat cannot take images",
    builtIn: "{path} is an image, and the model of this chat cannot take images.",
    slots: { path: pathSlot },
  }),
  imageTooLarge: defineText({
    id: "read.imageTooLarge",
    group,
    section: "result",
    label: "When an image cannot be made small enough for the model",
    builtIn: "{path} is an image that could not be made small enough for the model.",
    slots: { path: pathSlot },
  }),
};

/** The texts of the Read tool, in the order that the Agent place shows them. */
export const readTextList: ModelText[] = Object.values(readTexts);

const numberFormat = new Intl.NumberFormat("en-US");
const sizeFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
// A zero byte in the start of a file marks it as binary, because text almost never holds one.
const binaryProbe = 8192;
const similarCount = 3;

/**
 * Creates the Read tool, which returns the lines of a text file with their numbers, or an image,
 * and stops at the output limit between lines.
 */
export function createReadTool({ getLimits, texts }: ReadToolOptions): ToolDefinition {
  return defineTool({
    name: "Read",
    label: "Read",
    get description() {
      return texts.get(readTexts.description);
    },
    get parameters() {
      return Type.Object({
        path: Type.String({ minLength: 1, description: texts.get(readTexts.path) }),
        offset: Type.Optional(positionOf(texts.get(readTexts.offset))),
        limit: Type.Optional(positionOf(texts.get(readTexts.limit))),
        column: Type.Optional(positionOf(texts.get(readTexts.column))),
        length: Type.Optional(positionOf(texts.get(readTexts.length))),
      });
    },
    async execute(
      _toolCallId,
      { path, offset, limit, column, length },
      _signal,
      _onUpdate,
      context,
    ) {
      const file = resolve(context.cwd, path);
      const found = statOf(file);
      if (found === undefined) {
        const similar = similarNames(file, path);
        const missing = texts.fill(readTexts.missing, { path });
        throw new Error(
          similar.length === 0
            ? missing
            : `${missing} ${texts.fill(readTexts.similar, { names: similar.join(", ") })}`,
        );
      }
      if (found.isDirectory()) {
        throw new Error(texts.fill(readTexts.folder, { path }));
      }
      const mimeType = await detectSupportedImageMimeTypeFromFile(file);
      // Pi detects BMP too, but it only turns BMP into a format that models take inside its own tool.
      const { model } = context;
      if (mimeType !== null && mimeType !== undefined && mimeType !== "image/bmp") {
        if (model === undefined || !model.input.includes("image")) {
          return {
            content: [{ type: "text", text: texts.fill(readTexts.imageNotTaken, { path }) }],
            details: null,
          };
        }
        const resized = await resizeImage(
          await readFile(file),
          mimeType,
          model.inputLimits?.images?.resize,
        );
        if (resized === null) {
          throw new Error(texts.fill(readTexts.imageTooLarge, { path }));
        }
        const about = texts.fill(readTexts.image, {
          path,
          width: numberFormat.format(resized.originalWidth),
          height: numberFormat.format(resized.originalHeight),
        });
        const sizeNote = formatDimensionNote(resized);
        const details: ReadDetails = {
          kind: "image",
          width: resized.originalWidth,
          height: resized.originalHeight,
        };
        return {
          content: [
            { type: "text", text: sizeNote === undefined ? about : `${about}\n${sizeNote}` },
            { type: "image", data: resized.data, mimeType: resized.mimeType },
          ],
          details,
        };
      }
      const decoded = decode(await readFile(file));
      if (decoded === undefined) {
        throw new Error(texts.fill(readTexts.binary, { path, size: describeSize(found.size) }));
      }
      const lines = decoded.text.split(/\r?\n/);
      if (lines.at(-1) === "") {
        lines.pop();
      }
      if (lines.length === 0) {
        const details: ReadDetails = { kind: "empty" };
        return {
          content: [{ type: "text", text: texts.fill(readTexts.empty, { path }) }],
          details,
        };
      }
      const window = { offset: offset ?? 1, limit, column: column ?? 1, length };
      checkStart(lines, window, path, texts);
      const read = readLines(lines, window, getLimits(), texts);
      const details: ReadDetails = {
        kind: "text",
        firstLine: read.firstLine,
        lastLine: read.lastLine,
        lineCount: lines.length,
      };
      return {
        content: [
          {
            type: "text",
            text: decoded.isUtf8 ? read.text : `${read.text}\n${texts.get(readTexts.notUtf8)}`,
          },
        ],
        details,
      };
    },
  });
}

function positionOf(description: string): ReturnType<typeof Type.Integer> {
  return Type.Integer({ minimum: 1, description });
}

function statOf(file: string): Stats | undefined {
  try {
    return statSync(file);
  } catch {
    return undefined;
  }
}

// The names in the folder of a missing file that are closest to its own, as paths like the one
// that the model gave.
function similarNames(file: string, path: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dirname(file));
  } catch {
    return [];
  }
  const wanted = basename(file).toLowerCase();
  const stem = wanted.replace(/\.[^.]*$/, "");
  const given = dirname(path);
  return names
    .map((name) => ({ name, distance: distanceOf(name.toLowerCase(), wanted) }))
    .filter(
      ({ name, distance }) =>
        distance <= Math.max(2, Math.floor(wanted.length / 4)) ||
        name.toLowerCase().startsWith(stem),
    )
    .sort((first, second) => first.distance - second.distance)
    .slice(0, similarCount)
    .map(({ name }) => (given === "." ? name : join(given, name).replaceAll("\\", "/")));
}

// The number of single characters to add, remove, or change to turn one name into the other.
function distanceOf(first: string, second: string): number {
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (const [row, letter] of [...first].entries()) {
    const current = [row + 1];
    for (const [index, other] of [...second].entries()) {
      current.push(
        Math.min(
          (previous[index + 1] ?? 0) + 1,
          (current[index] ?? 0) + 1,
          (previous[index] ?? 0) + (letter === other ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[second.length] ?? 0;
}

// A file is text in UTF-16 when it starts with the mark of that encoding, and otherwise in UTF-8.
// It is binary when a zero byte comes early.
function decode(bytes: Buffer): { text: string; isUtf8: boolean } | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes), isUtf8: true };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes), isUtf8: true };
  }
  if (bytes.subarray(0, binaryProbe).includes(0)) {
    return undefined;
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), isUtf8: true };
  } catch {
    return { text: new TextDecoder("utf-8").decode(bytes), isUtf8: false };
  }
}

function describeSize(bytes: number): string {
  if (bytes < 1024) {
    return `${numberFormat.format(bytes)} bytes`;
  }
  const kilobytes = bytes / 1024;
  return kilobytes < 1024 ? `${kilobytes.toFixed(1)} KB` : `${(kilobytes / 1024).toFixed(1)} MB`;
}

// A read that starts past the end of the file, or past the end of its first line, fails.
function checkStart(lines: string[], window: ReadWindow, path: string, texts: ModelTexts): void {
  const { offset, column } = window;
  const first = lines[offset - 1];
  if (first === undefined) {
    throw new Error(
      texts.fill(readTexts.pastEnd, {
        path,
        last: numberFormat.format(lines.length),
        line: offset,
      }),
    );
  }
  if (column === 1 || column <= first.length) {
    return;
  }
  const line = numberFormat.format(offset);
  throw new Error(
    first.length === 0
      ? texts.fill(readTexts.lineEmpty, { line, path, column: numberFormat.format(column) })
      : texts.fill(readTexts.columnPastEnd, {
          line,
          path,
          last: numberFormat.format(first.length),
          column: numberFormat.format(column),
        }),
  );
}

// The read takes whole lines until the first of its limits. The output limit always ends it
// between lines, except for a first line that alone is longer than the limit.
function readLines(
  lines: string[],
  { offset, limit, column, length }: ReadWindow,
  outputLimits: OutputLimits,
  texts: ModelTexts,
): ReadLines {
  const shown: string[] = [];
  let bytes = 0;
  let charactersLeft = length ?? Number.POSITIVE_INFINITY;
  let index = offset - 1;
  // The line that the read stops inside, and the column where what is not shown starts.
  let cutLine: { line: number; column: number } | undefined;
  // Which part of the output limit stops the read, when one does.
  let stop: "lines" | "bytes" | undefined;
  let longLine: number | undefined;
  const lineLimit = Math.min(limit ?? Number.POSITIVE_INFINITY, outputLimits.maxLines);
  while (index < lines.length && shown.length < lineLimit && charactersLeft > 0) {
    const whole = lines[index] ?? "";
    const startColumn = index === offset - 1 ? column : 1;
    let piece = whole.slice(startColumn - 1);
    if (piece.length > charactersLeft) {
      piece = sliceWhole(piece, charactersLeft);
      cutLine = { line: index + 1, column: startColumn + piece.length };
    }
    const entry = `${index + 1}\t${piece}`;
    const entryBytes = Buffer.byteLength(entry) + (shown.length === 0 ? 0 : 1);
    if (bytes + entryBytes > outputLimits.maxBytes) {
      stop = "bytes";
      if (shown.length > 0) {
        cutLine = undefined;
        if (Buffer.byteLength(entry) > outputLimits.maxBytes) {
          longLine = index + 1;
        }
        break;
      }
      const prefix = `${index + 1}\t`;
      piece = prefixWithinBytes(piece, outputLimits.maxBytes - Buffer.byteLength(prefix));
      cutLine = { line: index + 1, column: startColumn + piece.length };
      shown.push(`${prefix}${piece}`);
      index += 1;
      break;
    }
    shown.push(entry);
    bytes += entryBytes;
    charactersLeft -= piece.length;
    index += 1;
    if (cutLine !== undefined) {
      break;
    }
  }
  const isLineLimitReached =
    shown.length === outputLimits.maxLines &&
    (limit === undefined || limit > outputLimits.maxLines);
  if (stop === undefined && isLineLimitReached && index < lines.length) {
    stop = "lines";
  }
  const lastLine = offset + shown.length - 1;
  const notShown = describeNotShown(lines, cutLine, index, texts);
  if (notShown === undefined) {
    return { text: shown.join("\n"), firstLine: offset, lastLine };
  }
  const parts = [notShown];
  if (stop !== undefined) {
    const limitText =
      stop === "lines"
        ? `${numberFormat.format(outputLimits.maxLines)} lines`
        : `${sizeFormat.format(outputLimits.maxBytes / 1024)} KB`;
    parts.push(texts.fill(readTexts.outputLimit, { limit: limitText }));
  }
  if (longLine !== undefined) {
    parts.push(
      texts.fill(readTexts.longLine, {
        line: numberFormat.format(longLine),
        characters: numberFormat.format(lines[longLine - 1]?.length ?? 0),
      }),
    );
  }
  const note = texts.fill(readTexts.note, { note: parts.join(" ") });
  return { text: [...shown, note].join("\n"), firstLine: offset, lastLine };
}

// What the read leaves out: the rest of the line that it stops inside, and the lines after it.
function describeNotShown(
  lines: string[],
  cutLine: { line: number; column: number } | undefined,
  nextIndex: number,
  texts: ModelTexts,
): string | undefined {
  const total = lines.length;
  const from = numberFormat.format(nextIndex + 1);
  const to = numberFormat.format(total);
  if (cutLine !== undefined) {
    const lineLength = lines[cutLine.line - 1]?.length ?? 0;
    if (cutLine.column <= lineLength) {
      const columns = {
        first: numberFormat.format(cutLine.column),
        last: numberFormat.format(lineLength),
        line: numberFormat.format(cutLine.line),
      };
      if (nextIndex >= total) {
        return texts.fill(readTexts.columnsNotShown, columns);
      }
      return nextIndex + 1 === total
        ? texts.fill(readTexts.columnsAndLineNotShown, { ...columns, next: to })
        : texts.fill(readTexts.columnsAndLinesNotShown, { ...columns, from, to });
    }
  }
  if (nextIndex >= total) {
    return undefined;
  }
  return nextIndex + 1 === total
    ? texts.fill(readTexts.lineNotShown, { line: to })
    : texts.fill(readTexts.linesNotShown, { first: from, last: to });
}

// A cut never splits the two halves of a character outside the basic plane.
function sliceWhole(text: string, count: number): string {
  const code = text.charCodeAt(count - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? count - 1 : count);
}

function prefixWithinBytes(text: string, maxBytes: number): string {
  let bytes = 0;
  let end = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (bytes + size > maxBytes) {
      break;
    }
    bytes += size;
    end += character.length;
  }
  return text.slice(0, end);
}
