import type { CommandEnd, RunningCommand, ShellProgress } from "../api-types.ts";
import { defineText, type ModelText, type ModelTexts } from "../model-texts.ts";
import { wrapNote } from "../wrap-note.ts";
import type { LimitedOutput, OutputLog } from "./create-output-log.ts";
import type { Shell } from "./find-shell.ts";
import { describeSeconds, type RunEnd } from "./run-command.ts";

/** The call of the Shell tool that a background command came from, in one chat. */
interface BackgroundStart {
  toolCallId: string;
  chatId: string;
  shell: Shell;
  command: string;
  outputPath: string;
}

/** A background command that has ended, with where its output is and its last lines. */
export interface BackgroundEnded {
  chatId: string;
  outputPath: string;
  lastLines: string;
  end: CommandEnd;
  isOutputOpen: boolean;
  isSeenByModel: boolean;
}

/** How a check of a background command waits: at most a time, or until a text appears. */
interface CheckWait {
  waitMs: number;
  until: string | undefined;
  signal: AbortSignal | undefined;
}

/**
 * What a check of a background command finds: what it printed since the last check, how long it
 * has run, and how it ended, once it has.
 */
interface CommandCheck {
  output: LimitedOutput;
  runMs: number;
  ended: BackgroundEnded | undefined;
}

/** What background commands need: who hears about them as they print and when they end. */
interface BackgroundOptions {
  onProgress: (chatId: string, toolCallId: string, progress: ShellProgress) => void;
  onEnd: (ended: BackgroundEnded) => void;
}

const endSlots = {
  id: { meaning: "The number of the background command.", example: "3" },
  time: { meaning: "How long the command ran.", example: "84.2 s" },
  path: {
    meaning: "The file that holds the whole output.",
    example: "~/.independum/outputs/chat/call.log",
  },
};

/**
 * The text after how a command ended, in the foreground or in the background, when a program that
 * it started still holds its output. It shows with the texts of Shell.
 */
export const outputOpenText: ModelText = defineText({
  id: "shell.outputOpen",
  group: "Shell",
  section: "result",
  label: "After how a command ended, when a program that it started still holds its output",
  builtIn: "A program that the command started still runs, so what it prints later is not here.",
  slots: {},
});

/**
 * The texts that say how a background command ended, in a note that wakes the agent or in the
 * result of StopCommand or CheckCommand, which the user can edit.
 */
const backgroundTexts = {
  source: defineText({
    id: "background.source",
    group: "Shell",
    section: "note",
    label: "The source in the envelope of a note about a background command",
    builtIn: "background command {id}",
    slots: { id: endSlots.id },
  }),
  ended: defineText({
    id: "background.ended",
    group: "Shell",
    section: "note",
    label: "When a background command ends",
    builtIn:
      "Background command {id} ended with exit code {code} after {time}. Its output is in {path}",
    slots: {
      ...endSlots,
      code: { meaning: "The exit code of the command.", example: "0" },
    },
  }),
  timedOut: defineText({
    id: "background.timedOut",
    group: "Shell",
    section: "note",
    label: "When its timeout stops a background command",
    builtIn: "Background command {id} stopped at its timeout after {time}. Its output is in {path}",
    slots: endSlots,
  }),
  stoppedByUser: defineText({
    id: "background.stoppedByUser",
    group: "Shell",
    section: "note",
    label: "When the user stops a background command",
    builtIn: "The user stopped background command {id} after {time}. Its output is in {path}",
    slots: endSlots,
  }),
  lastLines: defineText({
    id: "background.lastLines",
    group: "Shell",
    section: "note",
    label: "Below the note or the result of StopCommand, when the command printed anything",
    builtIn: "Its last lines:\n{lines}",
    slots: {
      lines: {
        meaning: "The last 20 lines of its output.",
        example: "Listening on http://localhost:5173\nReady in 812 ms",
      },
    },
  }),
  signaled: defineText({
    id: "background.signaled",
    group: "Shell",
    section: "note",
    label: "When a signal ends a background command",
    builtIn:
      "Background command {id} ended by signal {signal} after {time}. Its output is in {path}",
    slots: { ...endSlots, signal: { meaning: "The signal that ended it.", example: "SIGKILL" } },
  }),
  stoppedByModel: defineText({
    id: "stopCommand.stopped",
    group: "StopCommand",
    section: "result",
    label: "When it stops the command",
    builtIn: "Stopped background command {id} after {time}. Its output is in {path}",
    slots: endSlots,
  }),
};

/**
 * A command that started in a reply and goes on in the background, with its output log, its run,
 * and the controller that stops it.
 */
interface Adoption {
  start: BackgroundStart;
  startedAt: number;
  log: OutputLog;
  run: Promise<RunEnd>;
  controller: AbortController;
}

/** The commands that run in the background, which the model can check and the user and the model can stop. */
export interface BackgroundCommands {
  adopt(adoption: Adoption): number;
  check(chatId: string, id: number, wait: CheckWait): Promise<CommandCheck | undefined>;
  stopByModel(id: number): Promise<BackgroundEnded | undefined>;
  stopByUser(toolCallId: string): boolean;
  listRunning(chatId: string): RunningCommand[];
  stopAll(): void;
}

/** The texts that say how a background command ended, in the order that the Agent place shows them. */
export const backgroundTextList: ModelText[] = Object.values(backgroundTexts);

/** One background command, while it runs and after it ends, with the checks that wait on it. */
interface BackgroundCommand {
  start: BackgroundStart;
  startedAt: number;
  log: OutputLog;
  ended: Promise<BackgroundEnded>;
  checks: Set<() => void>;
  stop: (by: "user" | "model") => void;
}

const lastLineCount = 20;

/**
 * Keeps track of the background commands of every chat. They are numbered from 1, so the model can
 * name one, and they keep running while the user opens other chats. An ended one stays, so the
 * model can still check it.
 */
export function createBackgroundCommands({
  onProgress,
  onEnd,
}: BackgroundOptions): BackgroundCommands {
  const commands = new Map<number, BackgroundCommand>();
  const finished = new Map<number, BackgroundEnded>();
  let nextId = 1;

  function runningOf(chatId?: string): [number, BackgroundCommand][] {
    return [...commands].filter(
      ([id, command]) =>
        !finished.has(id) && (chatId === undefined || command.start.chatId === chatId),
    );
  }

  // A background command keeps its file, and its latest lines reach the chat of its call.
  function adopt({ start, startedAt, log, run, controller }: Adoption): number {
    const id = nextId;
    nextId += 1;
    let stoppedBy: "user" | "model" | undefined;
    const checks = new Set<() => void>();
    log.keep();
    log.follow((latest) =>
      onProgress(start.chatId, start.toolCallId, {
        shell: start.shell.name,
        output: latest,
        lastOutputAt: log.lastOutputAt(),
      }),
    );
    // A shell that cannot start ends the command at once, as a failure.
    const ended = run
      .catch(
        (): RunEnd => ({
          ending: "exited",
          exitCode: null,
          signal: null,
          isOutputOpen: false,
          durationMs: Date.now() - startedAt,
        }),
      )
      .then(async (end) => {
        await log.finish();
        const result: BackgroundEnded = {
          chatId: start.chatId,
          outputPath: start.outputPath,
          lastLines: log.latest().split("\n").slice(-lastLineCount).join("\n"),
          end: {
            id,
            toolCallId: start.toolCallId,
            ending: end.ending,
            exitCode: end.exitCode,
            signal: end.signal,
            durationMs: end.durationMs,
            isStoppedByUser: stoppedBy === "user",
          },
          isOutputOpen: end.isOutputOpen,
          // The model learns how the command ended from StopCommand, or from a check that waits.
          isSeenByModel: stoppedBy === "model" || checks.size > 0,
        };
        finished.set(id, result);
        for (const check of checks) {
          check();
        }
        onEnd(result);
        return result;
      });
    commands.set(id, {
      start,
      startedAt,
      log,
      ended,
      checks,
      stop: (by) => {
        stoppedBy = by;
        controller.abort();
      },
    });
    return id;
  }

  return {
    adopt,
    async check(chatId, id, { waitMs, until, signal }) {
      const command = commands.get(id);
      if (command === undefined || command.start.chatId !== chatId) {
        return undefined;
      }
      const isWaiting =
        !finished.has(id) &&
        waitMs > 0 &&
        signal?.aborted !== true &&
        (until === undefined || !command.log.hasPrinted(until));
      if (isWaiting) {
        const { checks, log } = command;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(stopWaiting, waitMs);
          const unwatch = until === undefined ? undefined : log.watch(until, stopWaiting);
          checks.add(stopWaiting);
          signal?.addEventListener("abort", stopWaiting, { once: true });
          function stopWaiting(): void {
            clearTimeout(timer);
            unwatch?.();
            checks.delete(stopWaiting);
            signal?.removeEventListener("abort", stopWaiting);
            resolve();
          }
        });
      }
      const ended = finished.get(id);
      return {
        output: command.log.take(),
        runMs: ended?.end.durationMs ?? Date.now() - command.startedAt,
        ended,
      };
    },
    async stopByModel(id) {
      const command = finished.has(id) ? undefined : commands.get(id);
      command?.stop("model");
      return command?.ended;
    },
    stopByUser(toolCallId) {
      const command = runningOf().find(([, each]) => each.start.toolCallId === toolCallId)?.[1];
      command?.stop("user");
      return command !== undefined;
    },
    listRunning(chatId) {
      return runningOf(chatId).map(([id, command]) => ({
        id,
        command: command.start.command,
        toolCallId: command.start.toolCallId,
        startedAt: command.startedAt,
        progress: {
          shell: command.start.shell.name,
          output: command.log.latest(),
          lastOutputAt: command.log.lastOutputAt(),
        },
      }));
    },
    stopAll() {
      for (const [, command] of runningOf()) {
        command.stop("user");
      }
    },
  };
}

/**
 * Returns how a background command ended, where its whole output is, and its last lines, as the
 * model reads it in a note or in the result of StopCommand.
 */
export function describeBackgroundEnded(ended: BackgroundEnded, texts: ModelTexts): string {
  const how = describeHowItEnded(ended, texts);
  return ended.lastLines === ""
    ? how
    : `${how}\n\n${texts.fill(backgroundTexts.lastLines, { lines: ended.lastLines })}`;
}

/** Returns the note that wakes the agent when a background command ends, in its envelope. */
export function describeBackgroundNote(ended: BackgroundEnded, texts: ModelTexts): string {
  const source = texts.fill(backgroundTexts.source, { id: ended.end.id });
  return wrapNote(source, describeBackgroundEnded(ended, texts), texts);
}

/**
 * Returns how a background command ended and where its whole output is, as the model reads it
 * after the output of a check.
 */
export function describeHowItEnded(
  { end, outputPath, isOutputOpen }: BackgroundEnded,
  texts: ModelTexts,
): string {
  const values = { id: end.id, time: describeSeconds(end.durationMs), path: outputPath };
  const how =
    end.ending === "timedOut"
      ? texts.fill(backgroundTexts.timedOut, values)
      : end.ending === "stopped"
        ? texts.fill(
            end.isStoppedByUser ? backgroundTexts.stoppedByUser : backgroundTexts.stoppedByModel,
            values,
          )
        : end.exitCode === null && end.signal !== null
          ? texts.fill(backgroundTexts.signaled, { ...values, signal: end.signal })
          : texts.fill(backgroundTexts.ended, { ...values, code: end.exitCode ?? "unknown" });
  return isOutputOpen ? `${how} ${texts.get(outputOpenText)}` : how;
}
