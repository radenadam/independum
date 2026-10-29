import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { OutputLimits, ShellDetails, ShellProgress } from "../api-types.ts";
import { defineText, type ModelText, type ModelTexts } from "../model-texts.ts";
import { type BackgroundCommands, outputOpenText } from "./create-background-commands.ts";
import { createOutputLog } from "./create-output-log.ts";
import type { Shell } from "./find-shell.ts";
import { describeSeconds, type RunEnd, runCommand } from "./run-command.ts";

/**
 * What the Shell tool needs: the shell, the output limits, and the variables that the user chose,
 * the model texts, where outputs stay, where each running command leaves a way to stop it on its
 * own, and the commands that run in the background.
 */
interface ShellToolOptions {
  getShell: () => Shell | undefined;
  getLimits: () => OutputLimits;
  getEnvironment: () => Record<string, string>;
  texts: ModelTexts;
  outputFolder: string;
  stops: Map<string, () => void>;
  background: BackgroundCommands;
}

const timeSlot = { meaning: "How long the command ran.", example: "2.4 s" };

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
      "Runs the command in the background, so the call returns at once with the id of the command and the file that receives its output. When the command ends, a new turn starts with a note of how it ended.",
    slots: {},
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
  backgroundStarted: defineText({
    id: "shell.backgroundStarted",
    group: "Shell",
    section: "result",
    label: "When the command starts in the background",
    builtIn: "Background command {id} runs. Its output goes to {path}",
    slots: {
      id: { meaning: "The number of the background command.", example: "3" },
      path: {
        meaning: "The file that receives its output.",
        example: "~/.independum/outputs/chat/call.log",
      },
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
      const names = Object.keys(getEnvironment());
      return names.length === 0
        ? described
        : `${described} ${texts.fill(shellTexts.environment, { names: names.join(", ") })}`;
    },
    get parameters() {
      return Type.Object({
        command: Type.String({ minLength: 1, description: texts.get(shellTexts.command) }),
        description: Type.Optional(
          Type.String({ description: texts.get(shellTexts.descriptionParameter) }),
        ),
        timeout: Type.Optional(
          Type.Number({ exclusiveMinimum: 0, description: texts.get(shellTexts.timeout) }),
        ),
        background: Type.Optional(Type.Boolean({ description: texts.get(shellTexts.background) })),
      });
    },
    async execute(
      toolCallId,
      { command, timeout, background: isBackground },
      signal,
      onUpdate,
      context,
    ) {
      const found = getShell();
      if (found === undefined) {
        throw new Error(texts.get(shellTexts.missing));
      }
      const shell: Shell = found;
      const chatId = context.sessionManager.getSessionId();
      const path = join(outputFolder, chatId, `${toolCallId}.log`);
      const timeoutMs = timeout === undefined ? undefined : timeout * 1000;
      if (isBackground === true) {
        const id = background.start({
          toolCallId,
          chatId,
          shell,
          command,
          folder: context.cwd,
          environment: getEnvironment(),
          timeoutMs,
          outputPath: path,
          limits: getLimits(),
        });
        const started: ShellDetails = {
          shell: shell.name,
          ending: "background",
          exitCode: null,
          signal: null,
          durationMs: 0,
          outputPath: path,
          backgroundId: id,
        };
        return {
          content: [{ type: "text", text: texts.fill(shellTexts.backgroundStarted, { id, path }) }],
          details: started,
        };
      }
      function report(latest: string): void {
        const progress: ShellProgress = {
          shell: shell.name,
          output: latest,
          lastOutputAt: log.lastOutputAt(),
        };
        onUpdate?.({ content: [], details: progress });
      }
      const log = createOutputLog(path, { limits: getLimits(), texts, onLatest: report });
      report("");
      // A command ends when the reply stops, or when the user stops this command alone, and then
      // the agent goes on with the result.
      const own = new AbortController();
      stops.set(toolCallId, () => own.abort());
      let end: RunEnd;
      try {
        end = await runCommand({
          shell,
          command,
          folder: context.cwd,
          environment: getEnvironment(),
          timeoutMs,
          signal: signal === undefined ? own.signal : AbortSignal.any([signal, own.signal]),
          onOutput: (text) => log.append(text),
        });
      } catch (error) {
        await log.finish();
        throw error;
      } finally {
        stops.delete(toolCallId);
      }
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
