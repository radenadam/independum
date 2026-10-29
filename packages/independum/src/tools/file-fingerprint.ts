import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { diffArrays } from "diff";
import { defineText, type ModelText, type ModelTexts } from "../model-texts.ts";

/**
 * The fingerprints of the version of a file that a tool saw: of its whole content, and of each of
 * its lines. The lines are left out when they are the same as in the version before, and they are
 * null for a file with more lines than the cap.
 */
export interface FileFingerprint {
  file: string;
  content: string;
  lines?: string | null;
}

/** The version of a file that a chat saw last, with the fingerprint of each line when it has one. */
interface SeenVersion {
  content: string;
  lines: number[] | null;
}

// A file with more lines than this keeps one fingerprint for its whole content, so the chat file
// stays small, and a change to it is noticed without naming its lines.
const lineCap = 100_000;
const placeCap = 10;
const numberFormat = new Intl.NumberFormat("en-US");
const pathSlot = { meaning: "The file as the model gave it.", example: "src/app.ts" };

/** The texts of the note that a file changed since the chat last saw it, which the user can edit. */
const fingerprintTexts = {
  changed: defineText({
    id: "file.changed",
    group: "Read",
    section: "result",
    label:
      "In Read and Edit, when the file changed since this chat last saw it through Read, Write, or Edit",
    builtIn: "[{path} changed since this chat last saw it, at {lines}.]",
    slots: {
      path: pathSlot,
      lines: { meaning: "The lines that differ now.", example: "lines 40 to 52 and 88" },
    },
  }),
  changedSomewhere: defineText({
    id: "file.changedSomewhere",
    group: "Read",
    section: "result",
    label:
      "The same, for a file with more than 100,000 lines, whose lines Independum does not track",
    builtIn: "[{path} changed since this chat last saw it.]",
    slots: { path: pathSlot },
  }),
};

/** The texts of the note that a file changed, in the order that the Agent place shows them. */
export const fingerprintTextList: ModelText[] = Object.values(fingerprintTexts);

/**
 * Returns the path that names a file in its fingerprints, the same for every way of writing it.
 */
export function fileKeyOf(file: string): string {
  try {
    return realpathSync.native(file);
  } catch {
    return resolve(file);
  }
}

/**
 * Returns the fingerprints of a version of a file, from its bytes and, for a text file, its lines
 * as Read shows them.
 */
export function fingerprintOf(
  file: string,
  bytes: Uint8Array,
  lines: string[] | undefined,
  seen: SeenVersion | undefined,
): FileFingerprint {
  const content = createHash("sha256").update(bytes).digest("hex");
  if (lines === undefined || lines.length > lineCap) {
    return { file, content, lines: null };
  }
  return seen?.content === content ? { file, content } : { file, content, lines: packLines(lines) };
}

/**
 * Returns the version of a file that this chat saw last on its current branch, from the
 * fingerprints in the results of its tools, or undefined when it never saw the file.
 */
export function lastSeenOf(context: ExtensionToolContext, file: string): SeenVersion | undefined {
  const branch = context.sessionManager.getBranch();
  let content: string | undefined;
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const fingerprint = fingerprintIn(branch[index]);
    if (fingerprint === undefined || fingerprint.file !== file) {
      continue;
    }
    content ??= fingerprint.content;
    if (fingerprint.content !== content) {
      continue;
    }
    if (fingerprint.lines === null) {
      return { content, lines: null };
    }
    if (fingerprint.lines !== undefined) {
      return { content, lines: unpackLines(fingerprint.lines) };
    }
  }
  return content === undefined ? undefined : { content, lines: null };
}

/**
 * Returns the note that a file changed since this chat last saw it, naming the lines that differ
 * now, or undefined when it did not change or the chat never saw it.
 */
export function describeChange(
  seen: SeenVersion | undefined,
  current: FileFingerprint,
  lines: string[] | undefined,
  path: string,
  texts: ModelTexts,
): string | undefined {
  if (seen === undefined || seen.content === current.content) {
    return undefined;
  }
  const places = seen.lines === null || lines === undefined ? [] : changedPlaces(seen.lines, lines);
  return places.length === 0
    ? texts.fill(fingerprintTexts.changedSomewhere, { path })
    : texts.fill(fingerprintTexts.changed, { path, lines: describePlaces(places) });
}

function fingerprintIn(entry: unknown): FileFingerprint | undefined {
  if (typeof entry !== "object" || entry === null || !("message" in entry)) {
    return undefined;
  }
  const { message } = entry as { message: { role?: string; details?: unknown } };
  if (message.role !== "toolResult") {
    return undefined;
  }
  const { details } = message;
  if (typeof details !== "object" || details === null || !("fingerprint" in details)) {
    return undefined;
  }
  return (details as { fingerprint: FileFingerprint }).fingerprint;
}

// Each line becomes four bytes of its hash, which tells nearly every pair of different lines apart.
function codeOf(line: string): number {
  return createHash("sha256").update(line).digest().readUInt32LE(0);
}

function packLines(lines: string[]): string {
  const packed = Buffer.alloc(lines.length * 4);
  for (const [index, line] of lines.entries()) {
    packed.writeUInt32LE(codeOf(line), index * 4);
  }
  return packed.toString("base64");
}

function unpackLines(packed: string): number[] {
  const bytes = Buffer.from(packed, "base64");
  return Array.from({ length: bytes.length / 4 }, (_, index) => bytes.readUInt32LE(index * 4));
}

// The places that differ, as ranges of lines in the file now. A place where lines were only removed
// is named by the line that follows it now.
function changedPlaces(seenLines: number[], lines: string[]): [number, number][] {
  const places: [number, number][] = [];
  let line = 1;
  let start: number | undefined;
  for (const part of diffArrays(seenLines, lines.map(codeOf))) {
    const count = part.count ?? part.value.length;
    if (part.added) {
      start ??= line;
      line += count;
    } else if (part.removed) {
      start ??= line;
    } else {
      if (start !== undefined) {
        places.push([start, Math.max(start, line - 1)]);
        start = undefined;
      }
      line += count;
    }
  }
  if (start !== undefined) {
    const last = Math.max(1, lines.length);
    places.push([Math.min(start, last), Math.min(Math.max(start, line - 1), last)]);
  }
  return places;
}

function describePlaces(places: [number, number][]): string {
  const named = places
    .slice(0, placeCap)
    .map(([first, last]) =>
      first === last
        ? numberFormat.format(first)
        : `${numberFormat.format(first)} to ${numberFormat.format(last)}`,
    );
  const rest = places.length - named.length;
  const word = places.length === 1 && places[0]?.[0] === places[0]?.[1] ? "line" : "lines";
  if (rest > 0) {
    return `${word} ${named.join(", ")}, and ${numberFormat.format(rest)} more`;
  }
  if (named.length <= 2) {
    return `${word} ${named.join(" and ")}`;
  }
  return `${word} ${named.slice(0, -1).join(", ")}, and ${named.at(-1)}`;
}
