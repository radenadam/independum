import { readdirSync, type Stats, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineText, type ModelText, type ModelTexts } from "../model-texts.ts";

/** A file that a tool found at the path that the model gave. */
interface FoundFile {
  file: string;
  stats: Stats;
}

/**
 * The text of a file with how it was stored: in UTF-8 or UTF-16, with or without a byte order
 * mark, and whether its bytes were valid UTF-8.
 */
export interface DecodedText {
  text: string;
  encoding: "utf-8" | "utf-16le" | "utf-16be";
  hasMark: boolean;
  isUtf8: boolean;
}

const pathSlot = { meaning: "The file as the model gave it.", example: "src/app.ts" };

/**
 * The texts that say why a tool cannot open a file, which the user can edit. They show with the
 * texts of Read.
 */
const fileTexts = {
  folder: defineText({
    id: "file.folder",
    group: "Read",
    section: "result",
    label: "In Read and Edit, when the path is a folder",
    builtIn: "{path} is a folder, not a file.",
    slots: { path: pathSlot },
  }),
  missing: defineText({
    id: "file.missing",
    group: "Read",
    section: "result",
    label: "In Read and Edit, when no file is at the path",
    builtIn: "No file at {path}.",
    slots: { path: pathSlot },
  }),
  similar: defineText({
    id: "file.similar",
    group: "Read",
    section: "result",
    label: "After a missing file, when its folder holds names like it",
    builtIn: "Similar names: {names}.",
    slots: {
      names: { meaning: "Up to three paths in the same folder.", example: "src/app.ts, src/apps" },
    },
  }),
  binary: defineText({
    id: "file.binary",
    group: "Read",
    section: "result",
    label: "In Read and Edit, when the file is binary and not an image that Read takes",
    builtIn: "{path} is a binary file of {size}, so it has no text to show.",
    slots: { path: pathSlot, size: { meaning: "The size of the file.", example: "2.4 MB" } },
  }),
};

/** The texts that say why a tool cannot open a file, in the order that the Agent place shows them. */
export const fileTextList: ModelText[] = Object.values(fileTexts);

const numberFormat = new Intl.NumberFormat("en-US");
// A zero byte in the start of a file marks it as binary, because text almost never holds one.
const binaryProbe = 8192;
const similarCount = 3;

/** Returns the parameter that names the file of a tool, with the description that the model sees. */
export function pathParameterOf(description: string): ReturnType<typeof Type.String> {
  return Type.String({ minLength: 1, description });
}

/**
 * Returns the file at a path in the project folder or an absolute path, or fails with the reason,
 * naming similar files in its folder when it is missing.
 */
export function findFile(path: string, folder: string, texts: ModelTexts): FoundFile {
  const file = resolve(folder, path);
  const stats = statOf(file);
  if (stats === undefined) {
    const similar = similarNames(file, path);
    const missing = texts.fill(fileTexts.missing, { path });
    throw new Error(
      similar.length === 0
        ? missing
        : `${missing} ${texts.fill(fileTexts.similar, { names: similar.join(", ") })}`,
    );
  }
  if (stats.isDirectory()) {
    throw new Error(texts.fill(fileTexts.folder, { path }));
  }
  return { file, stats };
}

/**
 * Returns the text of a file from its bytes, or fails as a binary file. A file is text in UTF-16
 * when it starts with the mark of that encoding, and otherwise in UTF-8.
 */
export function decodeText(bytes: Buffer, path: string, texts: ModelTexts): DecodedText {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    const text = new TextDecoder("utf-16le").decode(bytes);
    return { text, encoding: "utf-16le", hasMark: true, isUtf8: true };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const text = new TextDecoder("utf-16be").decode(bytes);
    return { text, encoding: "utf-16be", hasMark: true, isUtf8: true };
  }
  if (bytes.subarray(0, binaryProbe).includes(0)) {
    throw new Error(texts.fill(fileTexts.binary, { path, size: describeSize(bytes.length) }));
  }
  const hasMark = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text, encoding: "utf-8", hasMark, isUtf8: true };
  } catch {
    return {
      text: new TextDecoder("utf-8").decode(bytes),
      encoding: "utf-8",
      hasMark,
      isUtf8: false,
    };
  }
}

/** Returns the bytes of a text in the encoding of a file, with its byte order mark if it had one. */
export function encodeText(text: string, { encoding, hasMark }: DecodedText): Buffer {
  if (encoding === "utf-8") {
    const body = Buffer.from(text, "utf8");
    return hasMark ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body;
  }
  const body = Buffer.from(text, "utf16le");
  if (encoding === "utf-16be") {
    body.swap16();
    return Buffer.concat([Buffer.from([0xfe, 0xff]), body]);
  }
  return Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
}

/** Returns the lines of a text as Read shows them, without the line breaks of any system. */
export function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

// A size in bytes as the model reads it, such as 2.4 MB.
function describeSize(bytes: number): string {
  if (bytes < 1024) {
    return `${numberFormat.format(bytes)} bytes`;
  }
  const kilobytes = bytes / 1024;
  return kilobytes < 1024 ? `${kilobytes.toFixed(1)} KB` : `${(kilobytes / 1024).toFixed(1)} MB`;
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
