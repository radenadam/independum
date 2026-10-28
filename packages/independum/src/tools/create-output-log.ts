import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { OutputLimits } from "../api-types.ts";

/** The output of a tool as the model gets it. */
interface LimitedOutput {
  text: string;
  lineCount: number;
  isCut: boolean;
}

/**
 * How an output log works: the limits of what reaches the model, whether its file stays even when
 * nothing is cut, as a background command needs, and who hears about its latest lines.
 */
interface OutputLogOptions {
  limits: OutputLimits;
  isKept?: boolean;
  onLatest?: (latest: string) => void;
}

/** The output of one tool call, which grows as the tool prints. */
export interface OutputLog {
  append(text: string): void;
  latest(): string;
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

/**
 * Starts the output log of one tool call, which cleans each line as a plain text reader sees it and
 * writes all of it to the file at the path. When the output passes the limits, the model gets its
 * start and its end with a note of the lines that are cut, and the file stays for the rest.
 */
export function createOutputLog(
  path: string,
  { limits, isKept = false, onLatest }: OutputLogOptions,
): OutputLog {
  mkdirSync(dirname(path), { recursive: true });
  const file = createWriteStream(path);
  let isSaved = true;
  file.on("error", () => {
    isSaved = false;
  });
  const startLines = Math.floor(limits.maxLines * startShare);
  const startBytes = Math.floor(limits.maxBytes * startShare);
  const endLines = limits.maxLines - startLines;
  const endBytes = limits.maxBytes - startBytes;
  // Every line, until the output passes a limit.
  let whole: string[] | undefined = [];
  let wholeBytes = 0;
  const start: string[] = [];
  let startSize = 0;
  let isStartFull = false;
  const end: string[] = [];
  let endSize = 0;
  let isEndPartial = false;
  let lineCount = 0;
  let pending = "";
  let timer: NodeJS.Timeout | undefined;

  function latest(): string {
    const lines = (isStartFull ? end : start).slice(-latestLineCount);
    return [...lines, ...(pending === "" ? [] : [clean(pending)])].join("\n");
  }

  function addLine(line: string): void {
    lineCount += 1;
    file.write(`${line}\n`);
    const bytes = Buffer.byteLength(line) + 1;
    if (whole !== undefined) {
      whole.push(line);
      wholeBytes += bytes;
      if (whole.length > limits.maxLines || wholeBytes > limits.maxBytes) {
        whole = undefined;
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
  }

  function note(): string {
    const firstCut = start.length + 1;
    const lastCut = lineCount - end.length;
    const cut =
      firstCut <= lastCut
        ? `Lines ${numberFormat.format(firstCut)} to ${numberFormat.format(lastCut)} of ${numberFormat.format(lineCount)} are cut here.`
        : `The start of line ${numberFormat.format(lastCut + 1)} of ${numberFormat.format(lineCount)} is cut here.`;
    const partial =
      isEndPartial && firstCut <= lastCut
        ? ` The start of line ${numberFormat.format(lastCut + 1)} is cut too.`
        : "";
    const where = isSaved
      ? ` The whole output is in ${path}`
      : " The whole output could not be saved.";
    return `[${cut}${partial}${where}]`;
  }

  return {
    append(text) {
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
      if (onLatest !== undefined) {
        timer ??= setTimeout(() => {
          timer = undefined;
          onLatest(latest());
        }, latestInterval);
      }
    },
    latest,
    async finish() {
      clearTimeout(timer);
      if (pending !== "") {
        addLine(clean(pending));
        pending = "";
      }
      await new Promise<void>((resolve) => file.end(resolve));
      if (whole !== undefined && !isKept) {
        rmSync(path, { force: true });
      }
      if (whole !== undefined) {
        return { text: whole.join("\n"), lineCount, isCut: false };
      }
      return { text: [...start, note(), ...end].join("\n"), lineCount, isCut: true };
    },
  };
}

function clean(line: string): string {
  const plain = line.replace(terminalCodes, "").replace(/\r$/, "");
  return plain.slice(plain.lastIndexOf("\r") + 1);
}
