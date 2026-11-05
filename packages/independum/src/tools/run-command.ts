import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import { commandEnvironment } from "../command-environment.ts";
import {
  launchSandbox,
  type SandboxLaunch,
  sandboxCommand,
  sandboxRequest,
} from "../create-sandbox.ts";
import type { Shell } from "./find-shell.ts";
import { openWindowsJob, type WindowsJob } from "./open-windows-job.ts";

/** What to run, where, and what to do with its output as it comes. */
export interface RunOptions {
  sandbox?: SandboxLaunch | undefined;
  environmentMode?: "minimal" | "inherit";
  shell: Shell;
  command: string;
  folder: string;
  environment: Record<string, string>;
  timeoutMs: number | undefined;
  signal: AbortSignal | undefined;
  onOutput: (text: string) => void;
}

/**
 * How a command ended: on its own with an exit code or a signal, at its timeout, or stopped by the
 * user, and whether a program that it started still held its output when the run ended.
 */
export interface RunEnd {
  sandboxWarnings?: string[];
  ending: "exited" | "timedOut" | "stopped";
  exitCode: number | null;
  signal: string | null;
  isOutputOpen: boolean;
  durationMs: number;
}

// After the shell ends, its last output still arrives until the output has been quiet this long. A
// program that the command started can keep the output open, so the wait ends after the longest
// drain at the latest.
const quietTime = 100;
const longestDrain = 2000;
// A process tree that ignores the polite request to end gets this long before it is killed.
const killDelay = 2000;

const powerShellArguments = ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"];
// PowerShell writes to a pipe in the code page of the console, which loses most characters before
// Independum can read them. So the first line of each command sets UTF-8 for the way to Independum,
// and the command keeps its own line numbers.
const powerShellPrefix = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ";

// The command gets the environment of the user with the variables that the user added for
// commands.
/**
 * Runs one command, as written, in a new process of the shell, in the folder, with no input,
 * and ends the whole process tree on timeout or when the signal aborts.
 */
export async function runCommand(options: RunOptions): Promise<RunEnd> {
  const { shell, command, folder, environment, timeoutMs, signal, onOutput } = options;
  const startedAt = performance.now();
  if (signal?.aborted === true) {
    return { ending: "stopped", exitCode: null, signal: null, isOutputOpen: false, durationMs: 0 };
  }
  if (options.sandbox !== undefined) {
    return runIsolated(options, options.sandbox);
  }
  const child = spawn(shell.path, shellArguments(shell, command), {
    cwd: folder,
    env: commandEnvironment(options.environmentMode ?? "inherit", environment),
    stdio: ["ignore", "pipe", "pipe"],
    // On other systems the shell leads its own process group, so the whole tree can be ended.
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  // On Windows a job holds the shell with every program that it starts, even one whose parent has
  // ended, which the tree of parents no longer reaches.
  const job =
    process.platform === "win32" && child.pid !== undefined ? openWindowsJob(child.pid) : undefined;
  let ending: RunEnd["ending"] = "exited";
  let stopping: Promise<void> | undefined;
  function stop(reason: RunEnd["ending"]): void {
    if (stopping !== undefined) {
      return;
    }
    ending = reason;
    stopping = endTree(child, job);
  }
  function onAbort(): void {
    stop("stopped");
  }
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = timeoutMs === undefined ? undefined : setTimeout(() => stop("timedOut"), timeoutMs);
  let lastOutputAt = startedAt;
  for (const stream of [child.stdout, child.stderr]) {
    const decoder = new TextDecoder();
    stream?.on("data", (chunk: Buffer) => {
      lastOutputAt = performance.now();
      onOutput(decoder.decode(chunk, { stream: true }));
    });
  }
  let isOutputOpen = false;
  try {
    isOutputOpen = await waitForEnd(child, () => lastOutputAt);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    await stopping;
    job?.close();
  }
  return {
    ending,
    exitCode: child.exitCode,
    signal: child.signalCode,
    isOutputOpen,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

function shellArguments(shell: Shell, command: string): string[] {
  return shell.kind === "powershell"
    ? [...powerShellArguments, `${powerShellPrefix}${command}`]
    : ["-c", command];
}

async function runIsolated(options: RunOptions, sandbox: SandboxLaunch): Promise<RunEnd> {
  const startedAt = performance.now();
  const request = sandboxRequest(
    sandbox,
    sandboxCommand(options.shell.path, shellArguments(options.shell, options.command)),
    options.folder,
    commandEnvironment(options.environmentMode ?? "minimal", options.environment),
  );
  const process = await launchSandbox(request);
  let ending: RunEnd["ending"] = "exited";
  function stop(reason: RunEnd["ending"]): void {
    ending = reason;
    process.kill();
  }
  function onAbort(): void {
    stop("stopped");
  }
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted === true) {
    onAbort();
  }
  const timer =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => stop("timedOut"), options.timeoutMs);
  for (const stream of [process.standardOutput, process.standardError]) {
    const decoder = new TextDecoder();
    stream?.on("data", (chunk: Buffer) =>
      options.onOutput(decoder.decode(chunk, { stream: true })),
    );
    stream?.on("end", () => {
      const tail = decoder.decode();
      if (tail !== "") {
        options.onOutput(tail);
      }
    });
  }
  try {
    const end = await process.wait();
    return {
      ending: end.timedOut ? "timedOut" : ending,
      exitCode: end.exitCode,
      signal: null,
      isOutputOpen: false,
      durationMs: Math.round(performance.now() - startedAt),
      sandboxWarnings: [...process.warnings],
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    process.dispose();
  }
}

/** Returns a duration as the model reads it, such as 3.4 s. */
export function describeSeconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)} s`;
}

// Resolves when all output has closed, or when the output has been quiet since the shell ended, in
// which case a program that the command started still holds it. It resolves to whether that is so.
function waitForEnd(child: ChildProcess, lastOutputAt: () => number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve(false));
    child.once("exit", () => {
      const exitedAt = performance.now();
      const timer = setInterval(() => {
        const now = performance.now();
        if (
          now - Math.max(exitedAt, lastOutputAt()) >= quietTime ||
          now - exitedAt >= longestDrain
        ) {
          clearInterval(timer);
          child.stdout?.destroy();
          child.stderr?.destroy();
          resolve(true);
        }
      }, quietTime / 2);
      child.once("close", () => clearInterval(timer));
    });
  });
}

// On Windows, taskkill first ends every program whose parents still run, even one that left the
// job, as the programs that PowerShell from the Microsoft Store starts do. The job then ends every
// program in it whose parent has already ended, which the tree of parents no longer reaches.
async function endTree(child: ChildProcess, job: WindowsJob | undefined): Promise<void> {
  const { pid } = child;
  const isShellRunning = pid !== undefined && child.exitCode === null;
  if (process.platform === "win32") {
    if (isShellRunning) {
      await killTree(pid);
    }
    job?.end();
    return;
  }
  if (pid === undefined) {
    return;
  }
  signalGroup(pid, "SIGTERM");
  await new Promise<void>((resolve) => setTimeout(resolve, killDelay));
  signalGroup(pid, "SIGKILL");
}

function killTree(pid: number): Promise<void> {
  const systemRoot = process.env.SystemRoot ?? process.env.windir;
  const taskkill =
    systemRoot === undefined ? "taskkill.exe" : join(systemRoot, "System32", "taskkill.exe");
  return new Promise((resolve) => {
    const killing = spawn(taskkill, ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killing.once("close", () => resolve());
    killing.once("error", () => resolve());
  });
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // The group has already ended.
  }
}
