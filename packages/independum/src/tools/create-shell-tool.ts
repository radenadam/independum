import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { OutputLimits, ShellDetails, ShellProgress } from "../api-types.ts";
import { createOutputLog } from "./create-output-log.ts";
import type { Shell } from "./find-shell.ts";
import { type RunEnd, runCommand } from "./run-command.ts";

/**
 * What the Shell tool needs: the shell and the output limits that the user chose, where outputs
 * that are cut stay, and where each running command leaves a way to stop it on its own.
 */
interface ShellToolOptions {
  getShell: () => Shell | undefined;
  getLimits: () => OutputLimits;
  outputFolder: string;
  stops: Map<string, () => void>;
}

const parameters = Type.Object({
  command: Type.String({ minLength: 1, description: "The command to run." }),
  description: Type.Optional(
    Type.String({ description: "A few words on what the command does, shown to the user." }),
  ),
  timeout: Type.Optional(
    Type.Number({
      exclusiveMinimum: 0,
      description:
        "Seconds before the command is stopped. Without it, the command runs until it ends.",
    }),
  ),
});

// The latest output reaches the chat at most this often while a command runs.
const progressInterval = 100;

/**
 * Creates the Shell tool, which runs a command in the shell of the user and returns what it printed
 * and how it ended.
 */
export function createShellTool({
  getShell,
  getLimits,
  outputFolder,
  stops,
}: ShellToolOptions): ToolDefinition {
  return defineTool({
    name: "Shell",
    label: "Shell",
    // The user can choose another shell while a chat is open, so the description names the shell
    // each time Pi reads it.
    get description() {
      return `Runs a command in ${getShell()?.name ?? "the shell"} and returns its output and exit code. Each call starts a new process in the project folder, with no input.`;
    },
    parameters,
    async execute(toolCallId, { command, timeout }, signal, onUpdate, context) {
      const found = getShell();
      if (found === undefined) {
        throw new Error("The chosen shell is not installed on this computer.");
      }
      const shell: Shell = found;
      const path = join(outputFolder, context.sessionManager.getSessionId(), `${toolCallId}.log`);
      const log = createOutputLog(path, getLimits());
      let timer: NodeJS.Timeout | undefined;
      function report(): void {
        const progress: ShellProgress = { shell: shell.name, output: log.latest() };
        onUpdate?.({ content: [], details: progress });
      }
      report();
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
          timeoutMs: timeout === undefined ? undefined : timeout * 1000,
          signal: signal === undefined ? own.signal : AbortSignal.any([signal, own.signal]),
          onOutput(text) {
            log.append(text);
            timer ??= setTimeout(() => {
              timer = undefined;
              report();
            }, progressInterval);
          },
        });
      } catch (error) {
        await log.finish();
        throw error;
      } finally {
        clearTimeout(timer);
        stops.delete(toolCallId);
      }
      const output = await log.finish();
      const status = describeEnd(end, timeout);
      const details: ShellDetails = {
        shell: shell.name,
        ending: end.ending,
        exitCode: end.exitCode,
        durationMs: end.durationMs,
        outputPath: output.isCut ? path : null,
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

function describeEnd(end: RunEnd, timeout: number | undefined): string {
  const seconds = `${(end.durationMs / 1000).toFixed(1)} s`;
  if (end.ending === "timedOut") {
    return `Stopped at its timeout of ${timeout} s.`;
  }
  if (end.ending === "stopped") {
    return `Stopped by the user after ${seconds}.`;
  }
  return `Exit code ${end.exitCode ?? "unknown"} after ${seconds}.`;
}
