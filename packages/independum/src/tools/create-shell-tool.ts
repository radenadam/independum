import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { OutputLimits, ShellDetails, ShellProgress } from "../api-types.ts";
import { defineText, type ModelText, type ModelTexts } from "../model-texts.ts";
import { type BackgroundCommands, outputOpenText } from "./create-background-commands.ts";
import { createOutputLog } from "./create-output-log.ts";
import type { Shell } from "./find-shell.ts";
import { describeSeconds, type RunEnd, runCommand } from "./run-command.ts";

/**
 * What the Shell tool needs: the shell, the output limits, the variables, and the time before a
 * command goes on in the background that the user chose, the model texts, where outputs stay,
 * where each running command leaves a way to stop it or to move it to the background, and the
 * commands that run in the background.
 */
interface ShellToolOptions {
  getShell: () => Shell | undefined;
  getLimits: () => OutputLimits;
  getEnvironment: () => Record<string, string>;
  getHandBackSeconds: () => number;
  handBacks: Map<string, () => void>;
  texts: ModelTexts;
  outputFolder: string;
  stops: Map<string, () => void>;
  background: BackgroundCommands;
}

// PowerShell 7 takes most of a second to start on Windows, so a background command that fails at
// once still ends before its call returns.
const startCheckSeconds = 2;
const timeSlot = { meaning: "How long the command ran.", example: "2.4 s" };
const idSlot = { meaning: "The number of the background command.", example: "3" };
const outputSlot = {
  meaning: "The file that receives its output.",
  example: "~/.independum/outputs/chat/call.log",
};

/** The texts of the Shell tool that the model reads, which the user can edit. */
const shellTexts = {
  description: defineText({
    id: "shell.description",
    group: "Shell",
    section: "description",
    label: "Every request",
    builtIn:
      "Runs a command in {shell} and returns its output and exit code. Each call starts a new process in the project folder, with no input.",
    slots: {
      shell: { meaning: "The name of the chosen shell.", example: "PowerShell 7.6.9" },
    },
  }),
  handBack: defineText({
    id: "shell.handBack",
    group: "Shell",
    section: "description",
    label: "After the description, while commands go on in the background after a while",
    builtIn: "A command that still runs after {seconds} s goes on as a background command.",
    slots: { seconds: { meaning: "The seconds that the user chose.", example: "120" } },
  }),
  environment: defineText({
    id: "shell.environment",
    group: "Shell",
    section: "description",
    label: "After the description, when the user added variables for commands",
    builtIn: "Each command also gets these environment variables from the user: {names}.",
    slots: {
      names: {
        meaning: "The names of the variables, without their values, which can be secret.",
        example: "GIT_EDITOR, PYTHONUNBUFFERED",
      },
    },
  }),
  command: defineText({
    id: "shell.parameters.command",
    group: "Shell",
    section: "parameter",
    label: "command",
    builtIn: "The command to run.",
    slots: {},
  }),
  descriptionParameter: defineText({
    id: "shell.parameters.description",
    group: "Shell",
    section: "parameter",
    label: "description",
    builtIn: "A few words on what the command does, shown to the user.",
    slots: {},
  }),
  workdir: defineText({
    id: "shell.parameters.workdir",
    group: "Shell",
    section: "parameter",
    label: "workdir",
    builtIn:
      "The folder to run the command in, as a path in the project folder or an absolute path. Defaults to the project folder.",
    slots: {},
  }),
  timeout: defineText({
    id: "shell.parameters.timeout",
    group: "Shell",
    section: "parameter",
    label: "timeout",
    builtIn: "Seconds before the command is stopped. Without it, the command runs until it ends.",
    slots: {},
  }),
  background: defineText({
    id: "shell.parameters.background",
    group: "Shell",
    section: "parameter",
    label: "background",
    builtIn:
      "Runs the command in the background. The call returns after {seconds} s with what it printed so far, the id of the command, and the file that receives its output, or with its whole result when it ends sooner. When a background command ends, a new turn starts with a note of how it ended.",
    slots: { seconds: { meaning: "The seconds that a background call waits.", example: "2" } },
  }),
  exited: defineText({
    id: "shell.exited",
    group: "Shell",
    section: "result",
    label: "When the command ends, after its output",
    builtIn: "Exit code {code} after {time}.",
    slots: { code: { meaning: "The exit code of the command.", example: "0" }, time: timeSlot },
  }),
  timedOut: defineText({
    id: "shell.timedOut",
    group: "Shell",
    section: "result",
    label: "When its timeout stops the command, after its output",
    builtIn: "Stopped at its timeout of {timeout} s.",
    slots: { timeout: { meaning: "The timeout that the model set, in seconds.", example: "30" } },
  }),
  stoppedByUser: defineText({
    id: "shell.stoppedByUser",
    group: "Shell",
    section: "result",
    label: "When the user stops the command, after its output",
    builtIn: "Stopped by the user after {time}.",
    slots: { time: timeSlot },
  }),
  handedBack: defineText({
    id: "shell.handedBack",
    group: "Shell",
    section: "result",
    label: "When the command still runs after the time that the user chose, after its output",
    builtIn:
      "Still running after {time}, so it goes on as background command {id}. Its output goes to {path}",
    slots: {
      time: timeSlot,
      id: idSlot,
      path: outputSlot,
    },
  }),
  movedByUser: defineText({
    id: "shell.movedByUser",
    group: "Shell",
    section: "result",
    label: "When the user moves the command to the background, after its output",
    builtIn:
      "The user moved it to the background as background command {id} after {time}. Its output goes to {path}",
    slots: {
      id: idSlot,
      time: timeSlot,
      path: outputSlot,
    },
  }),
  workdirMissing: defineText({
    id: "shell.workdirMissing",
    group: "Shell",
    section: "result",
    label: "When the folder in workdir does not exist",
    builtIn: "No folder at {path}.",
    slots: { path: { meaning: "The folder that the model gave.", example: "src/app" } },
  }),
  backgroundStarted: defineText({
    id: "shell.backgroundStarted",
    group: "Shell",
    section: "result",
    label: "When the command still runs as its background call returns, after its output",
    builtIn: "Background command {id} runs. Its output goes to {path}",
    slots: {
      id: idSlot,
      path: outputSlot,
    },
  }),
  signaled: defineText({
    id: "shell.signaled",
    group: "Shell",
    section: "result",
    label: "When a signal ends the command, after its output",
    builtIn: "Ended by signal {signal} after {time}.",
    slots: { signal: { meaning: "The signal that ended it.", example: "SIGKILL" }, time: timeSlot },
  }),
  outputOpen: outputOpenText,
  missing: defineText({
    id: "shell.missing",
    group: "Shell",
    section: "result",
    label: "When the chosen shell is not installed",
    builtIn: "The chosen shell is not installed on this computer.",
    slots: {},
  }),
};

/** The texts of the Shell tool, in the order that the Agent place shows them. */
export const shellTextList: ModelText[] = Object.values(shellTexts);

/**
 * Creates the Shell tool, which runs a command in the shell of the user and returns what it printed
 * and how it ended.
 */
export function createShellTool({
  getShell,
  getLimits,
  getEnvironment,
  getHandBackSeconds,
  handBacks,
  texts,
  outputFolder,
  stops,
  background,
}: ShellToolOptions): ToolDefinition {
  return defineTool({
    name: "Shell",
    label: "Shell",
    // Pi reads the description and the parameters each time Independum registers the tools, so a
    // new shell or an edited text reaches the model with the next turn.
    get description() {
      const described = texts.fill(shellTexts.description, {
        shell: getShell()?.name ?? "the shell",
      });
      const seconds = getHandBackSeconds();
      const names = Object.keys(getEnvironment());
      return [
        described,
        ...(seconds === 0 ? [] : [texts.fill(shellTexts.handBack, { seconds })]),
        ...(names.length === 0
          ? []
          : [texts.fill(shellTexts.environment, { names: names.join(", ") })]),
      ].join(" ");
    },
    get parameters() {
      return Type.Object({
        command: Type.String({ minLength: 1, description: texts.get(shellTexts.command) }),
        description: Type.Optional(
          Type.String({ description: texts.get(shellTexts.descriptionParameter) }),
        ),
        workdir: Type.Optional(Type.String({ description: texts.get(shellTexts.workdir) })),
        timeout: Type.Optional(
          Type.Number({ exclusiveMinimum: 0, description: texts.get(shellTexts.timeout) }),
        ),
        background: Type.Optional(
          Type.Boolean({
            description: texts.fill(shellTexts.background, { seconds: startCheckSeconds }),
          }),
        ),
      });
    },
    async execute(
      toolCallId,
      { command, workdir, timeout, background: isBackground },
      signal,
      onUpdate,
      context,
    ) {
      const found = getShell();
      if (found === undefined) {
        throw new Error(texts.get(shellTexts.missing));
      }
      const shell: Shell = found;
      const folder = workdir === undefined ? context.cwd : resolve(context.cwd, workdir);
      if (!isFolder(folder)) {
        throw new Error(texts.fill(shellTexts.workdirMissing, { path: workdir ?? folder }));
      }
      const chatId = context.sessionManager.getSessionId();
      const path = join(outputFolder, chatId, `${toolCallId}.log`);
      const start = {
        toolCallId,
        chatId,
        shell,
        command,
        folder,
        environment: getEnvironment(),
        timeoutMs: timeout === undefined ? undefined : timeout * 1000,
        outputPath: path,
        limits: getLimits(),
      };
      function report(latest: string): void {
        const progress: ShellProgress = {
          shell: shell.name,
          output: latest,
          lastOutputAt: log.lastOutputAt(),
        };
        onUpdate?.({ content: [], details: progress });
      }
      const log = createOutputLog(path, { limits: start.limits, texts, onLatest: report });
      report("");
      // A command ends when the reply stops, or when the user stops this command alone, and then
      // the agent goes on with the result. A command that goes on in the background no longer ends
      // with the reply.
      const startedAt = Date.now();
      const own = new AbortController();
      const stopWithReply = (): void => own.abort();
      if (signal?.aborted === true) {
        own.abort();
      }
      signal?.addEventListener("abort", stopWithReply, { once: true });
      stops.set(toolCallId, () => own.abort());
      const run = runCommand({
        ...start,
        signal: own.signal,
        onOutput: (text) => log.append(text),
      });
      let first:
        | { kind: "ended"; end: RunEnd }
        | { kind: "started" | "handedBack" | "movedByUser" };
      let timer: NodeJS.Timeout | undefined;
      try {
        first = await Promise.race([
          run.then((end) => ({ kind: "ended" as const, end })),
          new Promise<{ kind: "started" | "handedBack" | "movedByUser" }>((resolveMove) => {
            // A background command that fails at once returns its whole result, so no note wakes
            // the agent for it.
            const seconds = isBackground === true ? startCheckSeconds : getHandBackSeconds();
            const kind = isBackground === true ? "started" : "handedBack";
            if (seconds > 0) {
              timer = setTimeout(() => resolveMove({ kind }), seconds * 1000);
            }
            handBacks.set(toolCallId, () => resolveMove({ kind: "movedByUser" }));
          }),
        ]);
      } catch (error) {
        await log.finish();
        throw error;
      } finally {
        clearTimeout(timer);
        stops.delete(toolCallId);
        handBacks.delete(toolCallId);
      }
      if (first.kind !== "ended") {
        signal?.removeEventListener("abort", stopWithReply);
        const output = log.take();
        const id = background.adopt({ start, startedAt, log, run, controller: own });
        const values = { id, time: describeSeconds(Date.now() - startedAt), path };
        const moved =
          first.kind === "started"
            ? texts.fill(shellTexts.backgroundStarted, values)
            : texts.fill(
                first.kind === "handedBack" ? shellTexts.handedBack : shellTexts.movedByUser,
                values,
              );
        const handedBack: ShellDetails = {
          shell: shell.name,
          ending: "background",
          exitCode: null,
          signal: null,
          durationMs: Date.now() - startedAt,
          outputPath: path,
          backgroundId: id,
        };
        return {
          content: [
            { type: "text", text: output.text === "" ? moved : `${output.text}\n\n${moved}` },
          ],
          details: handedBack,
        };
      }
      signal?.removeEventListener("abort", stopWithReply);
      const { end } = first;
      const output = await log.finish();
      const status = describeEnd(end, timeout, texts);
      const details: ShellDetails = {
        shell: shell.name,
        ending: end.ending,
        exitCode: end.exitCode,
        signal: end.signal,
        durationMs: end.durationMs,
        outputPath: output.isCut ? path : null,
        backgroundId: null,
      };
      return {
        content: [
          { type: "text", text: output.text === "" ? status : `${output.text}\n\n${status}` },
        ],
        details,
        isError: end.ending !== "exited" || end.exitCode !== 0,
      };
    },
  });
}

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function describeEnd(end: RunEnd, timeout: number | undefined, texts: ModelTexts): string {
  const time = describeSeconds(end.durationMs);
  if (end.ending === "timedOut") {
    return texts.fill(shellTexts.timedOut, { timeout: timeout ?? "unknown" });
  }
  if (end.ending === "stopped") {
    return texts.fill(shellTexts.stoppedByUser, { time });
  }
  const how =
    end.exitCode === null && end.signal !== null
      ? texts.fill(shellTexts.signaled, { signal: end.signal, time })
      : texts.fill(shellTexts.exited, { code: end.exitCode ?? "unknown", time });
  return end.isOutputOpen ? `${how} ${texts.get(shellTexts.outputOpen)}` : how;
}
