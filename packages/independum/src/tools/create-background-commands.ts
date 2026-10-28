import type { CommandEnd, OutputLimits, RunningCommand, ShellProgress } from "../api-types.ts";
import { createOutputLog, type OutputLog } from "./create-output-log.ts";
import type { Shell } from "./find-shell.ts";
import { describeSeconds, type RunEnd, runCommand } from "./run-command.ts";

/** A command to start in the background, for a call of the Shell tool in one chat. */
interface BackgroundStart {
  toolCallId: string;
  chatId: string;
  shell: Shell;
  command: string;
  folder: string;
  timeoutMs: number | undefined;
  outputPath: string;
  limits: OutputLimits;
}

/** A background command that has ended, with where its output is and its last lines. */
export interface BackgroundEnded {
  chatId: string;
  outputPath: string;
  lastLines: string;
  end: CommandEnd;
  isStoppedByModel: boolean;
}

/** Who hears about background commands as they print and when they end. */
interface BackgroundListeners {
  onProgress: (chatId: string, toolCallId: string, progress: ShellProgress) => void;
  onEnd: (ended: BackgroundEnded) => void;
}

/** The commands that run in the background, which the user and the model can stop. */
export interface BackgroundCommands {
  start(start: BackgroundStart): number;
  stopByModel(id: number): Promise<BackgroundEnded | undefined>;
  stopByUser(toolCallId: string): boolean;
  listRunning(chatId: string): RunningCommand[];
  stopAll(): void;
}

/** One background command while it runs. */
interface Running {
  start: BackgroundStart;
  startedAt: number;
  log: OutputLog;
  ended: Promise<BackgroundEnded>;
  stop: (by: "user" | "model") => void;
}

const lastLineCount = 20;

/**
 * Starts and keeps track of the background commands of every chat. They are numbered from 1, so
 * the model can name one, and they keep running while the user opens other chats.
 */
export function createBackgroundCommands({
  onProgress,
  onEnd,
}: BackgroundListeners): BackgroundCommands {
  const running = new Map<number, Running>();
  let nextId = 1;

  return {
    start(start) {
      const id = nextId;
      nextId += 1;
      const startedAt = Date.now();
      const controller = new AbortController();
      let stoppedBy: "user" | "model" | undefined;
      const log = createOutputLog(start.outputPath, {
        limits: start.limits,
        isKept: true,
        onLatest: (latest) =>
          onProgress(start.chatId, start.toolCallId, { shell: start.shell.name, output: latest }),
      });
      // A shell that cannot start ends the command at once, as a failure.
      const ended = runCommand({
        shell: start.shell,
        command: start.command,
        folder: start.folder,
        timeoutMs: start.timeoutMs,
        signal: controller.signal,
        onOutput: (text) => log.append(text),
      })
        .catch(
          (): RunEnd => ({ ending: "exited", exitCode: null, durationMs: Date.now() - startedAt }),
        )
        .then(async (end) => {
          await log.finish();
          running.delete(id);
          const result: BackgroundEnded = {
            chatId: start.chatId,
            outputPath: start.outputPath,
            lastLines: log.latest().split("\n").slice(-lastLineCount).join("\n"),
            end: {
              id,
              toolCallId: start.toolCallId,
              ending: end.ending,
              exitCode: end.exitCode,
              durationMs: end.durationMs,
              isStoppedByUser: stoppedBy === "user",
            },
            isStoppedByModel: stoppedBy === "model",
          };
          onEnd(result);
          return result;
        });
      running.set(id, {
        start,
        startedAt,
        log,
        ended,
        stop: (by) => {
          stoppedBy = by;
          controller.abort();
        },
      });
      return id;
    },
    async stopByModel(id) {
      const command = running.get(id);
      command?.stop("model");
      return command?.ended;
    },
    stopByUser(toolCallId) {
      const command = [...running.values()].find((each) => each.start.toolCallId === toolCallId);
      command?.stop("user");
      return command !== undefined;
    },
    listRunning(chatId) {
      return [...running.values()]
        .filter((command) => command.start.chatId === chatId)
        .map((command) => ({
          toolCallId: command.start.toolCallId,
          startedAt: command.startedAt,
          progress: { shell: command.start.shell.name, output: command.log.latest() },
        }));
    },
    stopAll() {
      for (const command of running.values()) {
        command.stop("user");
      }
    },
  };
}

/**
 * Returns how a background command ended, where its whole output is, and its last lines, as the
 * model reads it in a note or in the result of StopCommand.
 */
export function describeBackgroundEnded({ end, outputPath, lastLines }: BackgroundEnded): string {
  const time = describeSeconds(end.durationMs);
  const how =
    end.ending === "timedOut"
      ? `Background command ${end.id} stopped at its timeout after ${time}.`
      : end.ending === "stopped"
        ? `${end.isStoppedByUser ? "The user stopped" : "Stopped"} background command ${end.id} after ${time}.`
        : `Background command ${end.id} ended with exit code ${end.exitCode ?? "unknown"} after ${time}.`;
  const last = lastLines === "" ? "" : `\n\nIts last lines:\n${lastLines}`;
  return `${how} Its output is in ${outputPath}${last}`;
}
