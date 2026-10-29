import { createWriteStream, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { OutputLimits } from "../api-types.ts";
import { defineText, type ModelText, type ModelTexts } from "../model-texts.ts";

/** The output of a tool as the model gets it. */
export interface LimitedOutput {
  text: string;
  lineCount: number;
  isCut: boolean;
}

/**
 * How an output log works: the limits of what reaches the model, the texts of the note where it is
 * cut, whether its file stays even when nothing is cut, as a background command needs, and who
 * hears about its latest lines.
 */
interface OutputLogOptions {
  limits: OutputLimits;
  texts: ModelTexts;
  isKept?: boolean;
  onLatest?: (latest: string) => void;
}

const group = "Output limit";
const lineSlots = {
  first: { meaning: "The first line that is cut.", example: "401" },
  last: { meaning: "The last line that is cut.", example: "4,600" },
  total: { meaning: "How many lines the output has.", example: "5,000" },
  line: { meaning: "The line whose start is cut.", example: "4,601" },
};

/** The texts of the note that marks where output is cut, which the user can edit. */
const outputTexts = {
  frame: defineText({
    id: "output.frame",
    group,
    section: "note",
    label: "Around the note",
    builtIn: "[{note}]",
    slots: {
      note: {
        meaning: "The sentences below that apply, one after another.",
        example:
          "Lines 401 to 4,600 of 5,000 are cut here. The whole output is in ~/.independum/outputs/chat/call.log",
      },
    },
  }),
  linesCut: defineText({
    id: "output.linesCut",
    group,
    section: "note",
    label: "When whole lines are cut",
    builtIn: "Lines {first} to {last} of {total} are cut here.",
    slots: { first: lineSlots.first, last: lineSlots.last, total: lineSlots.total },
  }),
  lineStartCut: defineText({
    id: "output.lineStartCut",
    group,
    section: "note",
    label: "When only the start of one long line is cut",
    builtIn: "The start of line {line} of {total} is cut here.",
    slots: { line: lineSlots.line, total: lineSlots.total },
  }),
  lineStartAlsoCut: defineText({
    id: "output.lineStartAlsoCut",
    group,
    section: "note",
    label: "When the start of a line is cut as well",
    builtIn: "The start of line {line} is cut too.",
    slots: { line: lineSlots.line },
  }),
  saved: defineText({
    id: "output.saved",
    group,
    section: "note",
    label: "When the whole output is in a file",
    builtIn: "The whole output is in {path}",
    slots: {
      path: {
        meaning: "The file that holds the whole output.",
        example: "~/.independum/outputs/chat/call.log",
      },
    },
  }),
  notSaved: defineText({
    id: "output.notSaved",
    group,
    section: "note",
    label: "When the whole output could not be saved",
    builtIn: "The whole output could not be saved.",
    slots: {},
  }),
};

/**
 * The output of one tool call, which grows as the tool prints. Each take returns what is new since
 * the last one, and a check of a background command can wait for a text to appear. A command that
 * goes on in the background keeps its file and gets a new listener for its latest lines.
 */
export interface OutputLog {
  append(text: string): void;
  latest(): string;
  lastOutputAt(): number;
  take(): LimitedOutput;
  hasPrinted(text: string): boolean;
  watch(text: string, onFound: () => void): () => void;
  keep(): void;
  follow(onLatest: (latest: string) => void): void;
  finish(): Promise<LimitedOutput>;
}

// The start keeps a fifth of the limits and the end keeps the rest, because the end of a build or a
// test run usually says how it went.
const startShare = 0.2;
const latestLineCount = 40;
// The latest lines reach a listener at most this often while a tool prints.
const latestInterval = 100;
// A line that never ends, such as a stream of dots, is broken once it grows this long.
const longestPending = 1024 * 1024;
const numberFormat = new Intl.NumberFormat("en-US");
// Color and cursor codes of a terminal, which mean nothing in plain text.
const terminalCodes =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: The codes start with the escape character.
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;

/** Where the lines of an output are cut, counted from the first line of the whole output. */
interface Cut {
  first: number;
  last: number;
  total: number;
  isEndPartial: boolean;
}

/** The lines of an output from one line on, as the model gets them: all of them, or a start and an end. */
interface OutputWindow {
  add(line: string): void;
  latest(): string[];
  includes(text: string): boolean;
  isCut(): boolean;
  limited(rest: string[], describeCut: (cut: Cut) => string): LimitedOutput;
}

/** The texts of the note that marks where output is cut, in the order that the Agent place shows them. */
export const outputTextList: ModelText[] = Object.values(outputTexts);

/**
 * Starts the output log of one tool call, which cleans each line as a plain text reader sees it and
 * writes all of it to the file at the path. When the output passes the limits, the model gets its
 * start and its end with a note of the lines that are cut, and the file stays for the rest.
 */
export function createOutputLog(path: string, options: OutputLogOptions): OutputLog {
  const { limits, texts } = options;
  let isKept = options.isKept ?? false;
  let onLatest = options.onLatest;
  mkdirSync(dirname(path), { recursive: true });
  const file = createWriteStream(path);
  let isSaved = true;
  file.on("error", () => {
    isSaved = false;
  });
  // The whole output reaches the model when the command ends in the reply, and the output since
  // the last take reaches it when the command goes on in the background, and at each check.
  const whole = openWindow(limits, 0);
  let sinceTake = openWindow(limits, 0);
  const watchers = new Map<() => void, string>();
  let lineCount = 0;
  let fileBytes = 0;
  let takenBytes = 0;
  let pending = "";
  let timer: NodeJS.Timeout | undefined;
  let lastOutputAt = Date.now();

  function latest(): string {
    return [...whole.latest(), ...(pending === "" ? [] : [clean(pending)])].join("\n");
  }

  function addLine(line: string): void {
    lineCount += 1;
    file.write(`${line}\n`);
    fileBytes += Buffer.byteLength(line) + 1;
    whole.add(line);
    sinceTake.add(line);
    findWatched(line);
  }

  function findWatched(text: string): void {
    for (const [onFound, watched] of watchers) {
      if (text.includes(watched)) {
        watchers.delete(onFound);
        onFound();
      }
    }
  }

  function describeCut({ first, last, total, isEndPartial }: Cut): string {
    const line = numberFormat.format(last + 1);
    const lines = numberFormat.format(total);
    const parts =
      first <= last
        ? [
            texts.fill(outputTexts.linesCut, {
              first: numberFormat.format(first),
              last: numberFormat.format(last),
              total: lines,
            }),
            ...(isEndPartial ? [texts.fill(outputTexts.lineStartAlsoCut, { line })] : []),
          ]
        : [texts.fill(outputTexts.lineStartCut, { line, total: lines })];
    parts.push(isSaved ? texts.fill(outputTexts.saved, { path }) : texts.get(outputTexts.notSaved));
    return texts.fill(outputTexts.frame, { note: parts.join(" ") });
  }

  function rest(): string[] {
    return pending === "" ? [] : [clean(pending)];
  }

  return {
    append(text) {
      if (text !== "") {
        lastOutputAt = Date.now();
      }
      pending += text;
      const lastBreak = pending.lastIndexOf("\n");
      if (lastBreak !== -1) {
        for (const line of pending.slice(0, lastBreak).split("\n")) {
          addLine(clean(line));
        }
        pending = pending.slice(lastBreak + 1);
      }
      // A progress bar redraws its line after each return, so only the text after the last one
      // counts. A return at the very end may still be part of a line break.
      const lastReturn = pending.lastIndexOf("\r", pending.length - 2);
      if (lastReturn !== -1) {
        pending = pending.slice(lastReturn + 1);
      }
      if (pending.length > longestPending) {
        addLine(clean(pending));
        pending = "";
      }
      if (pending !== "") {
        findWatched(clean(pending));
      }
      if (onLatest !== undefined) {
        timer ??= setTimeout(() => {
          timer = undefined;
          onLatest?.(latest());
        }, latestInterval);
      }
    },
    latest,
    lastOutputAt: () => lastOutputAt,
    // A line that is still being printed comes again, whole, with the next take.
    take() {
      const taken = sinceTake.limited(rest(), describeCut);
      sinceTake = openWindow(limits, lineCount);
      takenBytes = fileBytes;
      return taken;
    },
    hasPrinted(text) {
      if (clean(pending).includes(text) || sinceTake.includes(text)) {
        return true;
      }
      if (!sinceTake.isCut()) {
        return false;
      }
      // The lines cut from the middle of the output are only in its file.
      try {
        return readFileSync(path).subarray(takenBytes).toString("utf8").includes(text);
      } catch {
        return false;
      }
    },
    watch(text, onFound) {
      watchers.set(onFound, text);
      return () => {
        watchers.delete(onFound);
      };
    },
    keep() {
      isKept = true;
    },
    follow(listener) {
      onLatest = listener;
    },
    async finish() {
      clearTimeout(timer);
      if (pending !== "") {
        addLine(clean(pending));
        pending = "";
      }
      await new Promise<void>((resolve) => file.end(resolve));
      if (!whole.isCut() && !isKept) {
        rmSync(path, { force: true });
      }
      return whole.limited([], describeCut);
    },
  };
}

// The window keeps every line until the output passes a limit, and then its start and its end.
function openWindow(limits: OutputLimits, firstLine: number): OutputWindow {
  const startLines = Math.floor(limits.maxLines * startShare);
  const startBytes = Math.floor(limits.maxBytes * startShare);
  const endLines = limits.maxLines - startLines;
  const endBytes = limits.maxBytes - startBytes;
  let all: string[] | undefined = [];
  let allBytes = 0;
  const start: string[] = [];
  let startSize = 0;
  let isStartFull = false;
  const end: string[] = [];
  let endSize = 0;
  let isEndPartial = false;
  let lineCount = 0;

  return {
    add(line) {
      lineCount += 1;
      const bytes = Buffer.byteLength(line) + 1;
      if (all !== undefined) {
        all.push(line);
        allBytes += bytes;
        if (all.length > limits.maxLines || allBytes > limits.maxBytes) {
          all = undefined;
        }
      }
      if (!isStartFull && start.length < startLines && startSize + bytes <= startBytes) {
        start.push(line);
        startSize += bytes;
        return;
      }
      isStartFull = true;
      end.push(line);
      endSize += bytes;
      while (end.length > 1 && (end.length > endLines || endSize > endBytes)) {
        endSize -= Buffer.byteLength(end.shift() ?? "") + 1;
        isEndPartial = false;
      }
      const only = end[0];
      if (end.length === 1 && only !== undefined && endSize > endBytes) {
        end[0] = only.slice(-endBytes);
        endSize = Buffer.byteLength(end[0]) + 1;
        isEndPartial = true;
      }
    },
    latest: () => (isStartFull ? end : start).slice(-latestLineCount),
    includes: (text) => [...start, ...end].some((line) => line.includes(text)),
    isCut: () => all === undefined,
    limited(rest, describeCut) {
      if (all !== undefined) {
        return { text: [...all, ...rest].join("\n"), lineCount, isCut: false };
      }
      const total = firstLine + lineCount;
      const cut = describeCut({
        first: firstLine + start.length + 1,
        last: total - end.length,
        total,
        isEndPartial,
      });
      return { text: [...start, cut, ...end, ...rest].join("\n"), lineCount, isCut: true };
    },
  };
}

function clean(line: string): string {
  const plain = line.replace(terminalCodes, "").replace(/\r$/, "");
  return plain.slice(plain.lastIndexOf("\r") + 1);
}
